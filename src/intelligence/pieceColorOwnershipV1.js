import chroma from "chroma-js";
import { measureDinoInteriorPixelsV1 } from "./dinoInteriorMeasurementV1.js";
import { selectMeasuredColorAuthorityV1 } from "./measurementAuthorityV1.js";

const GARMENT_TARGET_ZONES = new Set(["upper_garment", "lower_garment", "body_garment", "outerwear"]);
const ACCESSORY_TARGET_ZONES = new Set(["footwear", "accessory_jewelry", "belt", "bag"]);
const ALL_TARGET_ZONES = new Set([...GARMENT_TARGET_ZONES, ...ACCESSORY_TARGET_ZONES]);
const DINO_SOURCE_TYPES = new Set(["grounding_dino", "dino_detection"]);
const MIN_PIECE_CONFIDENCE = 0.45;
const MIN_SAM_VALIDATOR_CONFIDENCE = 0.55;
const MIN_SAM_TARGET_OVERLAP = 0.25;
const MIN_SAM_MASK_OVERLAP = 0.5;
const MAX_EXCLUDED_TARGET_RATIO = 0.35;
const MIN_KEPT_SAMPLE_RATIO = 0.25;
const DINO_INTERIOR_INSET_RATIO = 0.12;
const ACCESSORY_OUTER_INSET = 0.2;
const ACCESSORY_INNER_INSET = 0.3;
const ACCESSORY_MAX_DELTA_E = 12;
const ACCESSORY_MIN_CONFIDENCE = 0.55;
const GARMENT_SEMANTIC_PATTERN = /\b(shirt|top|tee|t-shirt|polo|sweater|hoodie|jacket|coat|pants|trousers|jeans|shorts|skirt|dress|garment|outerwear)\b/i;

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function normalizeConfidence(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return clamp01(n > 1 ? n / 100 : n);
}

function safeHex(value) {
  try {
    return chroma(value).hex().toUpperCase();
  } catch {
    return null;
  }
}

function colorDistanceLab(a, b) {
  try {
    return chroma.distance(a, b, "lab");
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function round3(value) {
  return Math.round(Number(value || 0) * 1000) / 1000;
}

function textTokens(region = {}) {
  return [
    region?.label,
    region?.segment_label,
    region?.category,
    region?.object_type,
    region?.accessory_type,
    region?.display_zone_label,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function rawBox(region = {}) {
  return region?.bounding_box || region?.bbox || region?.mask_geometry?.bbox || null;
}

export function normalizeOwnershipBox(regionOrBox = {}, imageWidth = 0, imageHeight = 0) {
  const box = rawBox(regionOrBox) || regionOrBox;
  if (!box) return null;

  let x = Number(box.x ?? box.left ?? box.x_min);
  let y = Number(box.y ?? box.top ?? box.y_min);
  let width = Number(box.width ?? box.w);
  let height = Number(box.height ?? box.h);

  const xMax = Number(box.x_max ?? box.right);
  const yMax = Number(box.y_max ?? box.bottom);
  if (!Number.isFinite(width) && Number.isFinite(x) && Number.isFinite(xMax)) width = xMax - x;
  if (!Number.isFinite(height) && Number.isFinite(y) && Number.isFinite(yMax)) height = yMax - y;
  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return null;

  const appearsPixelBased = x > 1 || y > 1 || width > 1 || height > 1;
  if (appearsPixelBased) {
    if (!imageWidth || !imageHeight) return null;
    x /= imageWidth;
    width /= imageWidth;
    y /= imageHeight;
    height /= imageHeight;
  }

  const left = clamp01(x);
  const top = clamp01(y);
  const right = clamp01(x + width);
  const bottom = clamp01(y + height);
  if (right <= left || bottom <= top) return null;
  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
    right,
    bottom,
  };
}

function intersection(a, b) {
  if (!a || !b) return null;
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const right = Math.min(a.right, b.right);
  const bottom = Math.min(a.bottom, b.bottom);
  if (right <= x || bottom <= y) return null;
  return { x, y, right, bottom, width: right - x, height: bottom - y };
}

function area(box) {
  return box ? Math.max(0, box.width) * Math.max(0, box.height) : 0;
}

function pieceClass(region = {}) {
  const zone = String(region?.zone || "").toLowerCase();
  const tokens = textTokens(region);
  if (/\bbelt\b/.test(tokens) || zone === "belt") return "belt";
  if (zone === "footwear" || /\b(shoe|shoes|sneaker|sneakers|boot|boots|loafer|loafers|heel|heels|sandal|sandals)\b/.test(tokens)) return "footwear";
  if (zone === "bag" || /\b(bag|handbag|purse|tote|crossbody|backpack|wallet)\b/.test(tokens)) return "bag";
  if (zone === "accessory_jewelry") {
    if (/\b(hat|cap|beanie|headwear)\b/.test(tokens)) return "headwear";
    if (/\b(scarf)\b/.test(tokens)) return "scarf";
    if (/\b(watch|bracelet|ring|chain|necklace|pendant|earring|earrings|brooch|pin)\b/.test(tokens)) return "jewelry";
    return "accessory";
  }
  return null;
}

function qualifiesForTarget(targetRegion, targetBox, pieceRegion, pieceBox) {
  if (!targetBox || !pieceBox || targetRegion === pieceRegion) return null;
  if (normalizeConfidence(pieceRegion?.confidence) < MIN_PIECE_CONFIDENCE) return null;
  const overlap = intersection(targetBox, pieceBox);
  if (!overlap) return null;

  const targetZone = String(targetRegion?.zone || "");
  const klass = pieceClass(pieceRegion);
  if (!klass || klass === "headwear") return null;

  const targetRatio = area(overlap) / Math.max(area(targetBox), 1e-6);
  const pieceRatio = area(overlap) / Math.max(area(pieceBox), 1e-6);
  if (targetRatio <= 0 || targetRatio > MAX_EXCLUDED_TARGET_RATIO || pieceRatio < 0.18) return null;

  const pieceCenterY = pieceBox.y + pieceBox.height / 2;
  const relativeY = (pieceCenterY - targetBox.y) / targetBox.height;
  const aspect = pieceBox.width / Math.max(pieceBox.height, 1e-6);

  if (targetZone === "lower_garment") {
    if (klass === "belt") {
      if (relativeY > 0.38 || aspect < 1.4) return null;
      return { reason: "belt_owned_at_waist", klass, targetRatio, pieceRatio };
    }
    if (klass === "footwear") {
      if (relativeY < 0.62) return null;
      return { reason: "footwear_owned_below_lower_garment", klass, targetRatio, pieceRatio };
    }
    if (klass === "bag" && relativeY >= 0.08 && relativeY <= 0.88) {
      return { reason: "bag_overlap_owned_by_bag", klass, targetRatio, pieceRatio };
    }
    return null;
  }

  if (["upper_garment", "body_garment", "outerwear"].includes(targetZone)) {
    if (klass === "bag") return { reason: "bag_overlap_owned_by_bag", klass, targetRatio, pieceRatio };
    if (["belt", "scarf", "jewelry", "accessory"].includes(klass)) {
      return { reason: `${klass}_overlap_owned_by_accessory`, klass, targetRatio, pieceRatio };
    }
  }
  return null;
}

function expandBox(box, targetBox, amount = 0.008) {
  const dx = targetBox.width * amount;
  const dy = targetBox.height * amount;
  const x = Math.max(targetBox.x, box.x - dx);
  const y = Math.max(targetBox.y, box.y - dy);
  const right = Math.min(targetBox.right, box.right + dx);
  const bottom = Math.min(targetBox.bottom, box.bottom + dy);
  return { x, y, right, bottom, width: right - x, height: bottom - y };
}

function isSemanticallyIdentifiedSamGarment(region = {}) {
  if (region?.source_type !== "sam_segment" || !GARMENT_TARGET_ZONES.has(String(region?.zone || ""))) return false;
  if (!region?.mask_url || !region?.mask_geometry) return false;
  if (normalizeConfidence(region?.confidence) < MIN_SAM_VALIDATOR_CONFIDENCE) return false;
  const label = String(region?.segment_label || region?.label || "").trim();
  if (!label || /^segment_?\d+$/i.test(label)) return false;
  return GARMENT_SEMANTIC_PATTERN.test(label);
}

function buildValidatedSamCandidates(targetRegion, targetBox, regions = [], boxes = new Map()) {
  const targetZone = String(targetRegion?.zone || "");
  const validators = [];
  const candidates = [];

  for (const samRegion of regions) {
    if (!isSemanticallyIdentifiedSamGarment(samRegion)) continue;
    if (String(samRegion?.zone || "") !== targetZone) continue;
    const samBox = boxes.get(samRegion);
    if (!samBox) continue;
    const overlap = intersection(targetBox, samBox);
    if (!overlap) continue;
    const targetOverlap = area(overlap) / Math.max(area(targetBox), 1e-6);
    const maskOverlap = area(overlap) / Math.max(area(samBox), 1e-6);
    if (targetOverlap < MIN_SAM_TARGET_OVERLAP || maskOverlap < MIN_SAM_MASK_OVERLAP) continue;

    const colors = (Array.isArray(samRegion?.region_colors) ? samRegion.region_colors : [])
      .map((color) => ({ ...color, hex: safeHex(color?.hex) }))
      .filter((color) => !!color.hex);
    if (!colors.length) continue;

    const validator = {
      validator: "sam_mask_pixel_membership_v1",
      sam_region_id: samRegion?.id || samRegion?.region_id || null,
      sam_segment_label: samRegion?.segment_label || samRegion?.label || null,
      target_zone: targetZone,
      target_overlap_ratio: round3(targetOverlap),
      mask_overlap_ratio: round3(maskOverlap),
      confidence: round3(normalizeConfidence(samRegion?.confidence)),
      validated: true,
    };
    validators.push(validator);
    for (const color of colors) {
      candidates.push({
        ...color,
        source: "sam_mask_interior",
        measurement_source: "sam_mask_interior",
        ownership_state: "owned",
        ownership_validated: true,
        ownership_validation: validator,
        confidence: normalizeConfidence(samRegion?.confidence),
        traceable_to_pixels: true,
        interior_ratio: 1,
      });
    }
  }

  return { candidates, validators };
}

function accessorySecondaryThreshold(zone) {
  return zone === "accessory_jewelry" ? 0.12 : 0.08;
}

function accessoryPaletteLimit(zone) {
  return zone === "accessory_jewelry" ? 2 : 3;
}

function buildAccessoryNestedInteriorValidation(region, targetBox, decodedImage) {
  const zone = String(region?.zone || "");
  if (!ACCESSORY_TARGET_ZONES.has(zone)) return { candidates: [], validators: [], measurements: null };
  const confidence = normalizeConfidence(region?.confidence);
  if (confidence < ACCESSORY_MIN_CONFIDENCE) {
    return { candidates: [], validators: [], measurements: null, reason: "accessory_confidence_too_low" };
  }

  const outer = measureDinoInteriorPixelsV1({
    decodedImage,
    bbox: targetBox,
    insetRatio: zone === "accessory_jewelry" ? 0.24 : ACCESSORY_OUTER_INSET,
    limit: 5,
  });
  const inner = measureDinoInteriorPixelsV1({
    decodedImage,
    bbox: targetBox,
    insetRatio: zone === "accessory_jewelry" ? 0.33 : ACCESSORY_INNER_INSET,
    limit: 5,
  });
  const outerTop = safeHex(outer?.colors?.[0]?.hex);
  const innerTop = safeHex(inner?.colors?.[0]?.hex);
  if (!outer?.available || !inner?.available || !outerTop || !innerTop) {
    return { candidates: [], validators: [], measurements: { outer, inner }, reason: "nested_interior_unavailable" };
  }

  const deltaE = colorDistanceLab(outerTop, innerTop);
  const maxDeltaE = zone === "accessory_jewelry" ? 10 : ACCESSORY_MAX_DELTA_E;
  const stable = Number.isFinite(deltaE) && deltaE <= maxDeltaE;
  const validator = {
    validator: "nested_accessory_interior_stability_v1",
    target_zone: zone,
    outer_inset_ratio: outer?.inset_ratio ?? null,
    inner_inset_ratio: inner?.inset_ratio ?? null,
    outer_top_hex: outerTop,
    inner_top_hex: innerTop,
    delta_e: round3(deltaE),
    max_delta_e: maxDeltaE,
    outer_sample_count: Number(outer?.sample_count || 0),
    inner_sample_count: Number(inner?.sample_count || 0),
    confidence: round3(confidence),
    validated: stable,
    doctrine: "detector_box_proposes_nested_pixel_stability_validates",
  };
  if (!stable) {
    return { candidates: [], validators: [validator], measurements: { outer, inner }, reason: "nested_interior_unstable" };
  }

  const threshold = accessorySecondaryThreshold(zone);
  const limit = accessoryPaletteLimit(zone);
  const stableColors = (inner?.colors || [])
    .filter((color, index) => index === 0 || Number(color?.pct || 0) >= threshold)
    .slice(0, limit)
    .map((color) => ({
      ...color,
      source: "owned_interior_pixels",
      measurement_source: "owned_interior_pixels",
      ownership_state: "owned",
      ownership_validated: true,
      ownership_validation: validator,
      confidence,
      traceable_to_pixels: true,
      interior_ratio: 1,
    }));

  return { candidates: stableColors, validators: [validator], measurements: { outer, inner }, reason: null };
}

function buildMeasurementCandidates(region, interiorMeasurement, validatedCandidates = []) {
  const confidence = normalizeConfidence(region?.confidence);
  const interior = (interiorMeasurement?.colors || []).map((color) => ({
    ...color,
    source: "dino_bbox_interior",
    measurement_source: "dino_bbox_interior",
    ownership_state: "proposed",
    ownership_validated: false,
    confidence,
    traceable_to_pixels: true,
  }));

  const rawHex = safeHex(region?.dominant_hex || region?.region_colors?.[0]?.hex || "");
  const raw = rawHex
    ? [{
        hex: rawHex,
        source: "dino_bbox",
        measurement_source: "dino_bbox",
        ownership_state: "proposed",
        ownership_validated: false,
        confidence,
        traceable_to_pixels: true,
      }]
    : [];

  return [...validatedCandidates, ...interior, ...raw];
}

export function applyPieceColorOwnershipV1({ decodedImage = null, regions = [] } = {}) {
  if (!decodedImage?.data || !Array.isArray(regions) || !regions.length) {
    return {
      regions: Array.isArray(regions) ? regions : [],
      summary: { available: false, version: "piece_color_ownership_v1", reason: "missing_image_or_regions" },
    };
  }

  const width = Number(decodedImage.width || 0);
  const height = Number(decodedImage.height || 0);
  const boxes = new Map(regions.map((region) => [region, normalizeOwnershipBox(region, width, height)]));
  let correctedRegionCount = 0;
  let measuredRegionCount = 0;
  let excludedPieceCount = 0;
  let validatedSamRegionCount = 0;
  let validatedAccessoryRegionCount = 0;
  let accessoryAbstentionCount = 0;

  const out = regions.map((region) => {
    const targetZone = String(region?.zone || "");
    const isDinoTarget = DINO_SOURCE_TYPES.has(region?.source_type);
    const targetBox = boxes.get(region);
    if (!ALL_TARGET_ZONES.has(targetZone) || !isDinoTarget || !targetBox) return region;

    const isGarmentTarget = GARMENT_TARGET_ZONES.has(targetZone);
    const isAccessoryTarget = ACCESSORY_TARGET_ZONES.has(targetZone);
    const ownershipClaims = [];
    if (isGarmentTarget) {
      for (const piece of regions) {
        const pieceBox = boxes.get(piece);
        const claim = qualifiesForTarget(region, targetBox, piece, pieceBox);
        if (!claim) continue;
        const overlap = intersection(targetBox, pieceBox);
        if (!overlap) continue;
        ownershipClaims.push({
          piece_id: piece?.id || piece?.region_id || piece?.detection_id || null,
          piece_zone: piece?.zone || null,
          piece_label: piece?.label || piece?.segment_label || piece?.object_type || piece?.accessory_type || null,
          piece_class: claim.klass,
          reason: claim.reason,
          confidence: round3(normalizeConfidence(piece?.confidence)),
          target_overlap_ratio: round3(claim.targetRatio),
          piece_overlap_ratio: round3(claim.pieceRatio),
          exclusion_box: expandBox(overlap, targetBox),
        });
      }
    }

    const exclusionBoxes = ownershipClaims.map((claim) => claim.exclusion_box);
    const interiorMeasurement = measureDinoInteriorPixelsV1({
      decodedImage,
      bbox: targetBox,
      exclusions: exclusionBoxes,
      insetRatio: isAccessoryTarget
        ? (targetZone === "accessory_jewelry" ? 0.24 : ACCESSORY_OUTER_INSET)
        : DINO_INTERIOR_INSET_RATIO,
    });
    const keptRatio = interiorMeasurement?.sample_count
      ? interiorMeasurement.sample_count /
        Math.max(1, interiorMeasurement.sample_count + Number(interiorMeasurement?.excluded_sample_count || 0))
      : 0;

    const samValidation = isGarmentTarget
      ? buildValidatedSamCandidates(region, targetBox, regions, boxes)
      : { candidates: [], validators: [] };
    const accessoryValidation = isAccessoryTarget
      ? buildAccessoryNestedInteriorValidation(region, targetBox, decodedImage)
      : { candidates: [], validators: [], measurements: null, reason: null };
    const validatedCandidates = [...samValidation.candidates, ...accessoryValidation.candidates];
    const authority = selectMeasuredColorAuthorityV1(
      buildMeasurementCandidates(region, interiorMeasurement, validatedCandidates)
    );
    const selected = authority.selected;

    if (!interiorMeasurement?.available || !selected || keptRatio < MIN_KEPT_SAMPLE_RATIO) {
      if (isAccessoryTarget) accessoryAbstentionCount += 1;
      return {
        ...region,
        color_debug: {
          ...(region?.color_debug || {}),
          piece_color_ownership_v1: {
            applied: false,
            target_type: isAccessoryTarget ? "accessory" : "garment",
            reason: !interiorMeasurement?.available
              ? interiorMeasurement?.reason || "interior_measurement_unavailable"
              : !selected
                ? (accessoryValidation?.reason || "no_validated_pixel_ownership_authority")
                : "insufficient_owned_pixels",
            ownership_claims: ownershipClaims,
            sam_ownership_validators: samValidation.validators,
            accessory_ownership_validators: accessoryValidation.validators,
            accessory_nested_measurements: accessoryValidation.measurements,
            sample_count: interiorMeasurement?.sample_count || 0,
            excluded_sample_count: interiorMeasurement?.excluded_sample_count || 0,
            kept_sample_count: interiorMeasurement?.sample_count || 0,
            kept_sample_ratio: round3(keptRatio),
            measurement_authority_v1: authority,
          },
        },
      };
    }

    measuredRegionCount += 1;
    validatedSamRegionCount += samValidation.validators.filter((validator) => validator?.validated).length;
    validatedAccessoryRegionCount += accessoryValidation.validators.filter((validator) => validator?.validated).length;
    excludedPieceCount += ownershipClaims.length;
    const rawDominant = safeHex(region?.dominant_hex || region?.region_colors?.[0]?.hex || "");
    if (rawDominant !== selected.hex || ownershipClaims.length) correctedRegionCount += 1;

    const publishableColors = authority.publishable.map((color) => ({
      hex: color.hex,
      pct: color.pct,
      percentage: color.percentage,
      pixel_count: color.pixel_count,
      source: color.source,
      measurement_source: color.measurement_source || color.source,
      ownership_state: "owned",
      ownership_validated: true,
      ownership_validation: color.ownership_validation || null,
      confidence: color.confidence,
      measurement_authority: selected.hex === color.hex ? "selected" : "supporting",
    }));

    return {
      ...region,
      dominant_hex: selected.hex,
      region_colors: publishableColors,
      color_debug: {
        ...(region?.color_debug || {}),
        piece_color_ownership_v1: {
          applied: true,
          target_type: isAccessoryTarget ? "accessory" : "garment",
          authority: "validated_pixel_membership",
          raw_dominant_hex: rawDominant,
          raw_region_colors: Array.isArray(region?.region_colors) ? region.region_colors : [],
          proposed_dino_interior_colors: interiorMeasurement.colors || [],
          owned_dominant_hex: selected.hex,
          owned_region_colors: publishableColors,
          ownership_claims: ownershipClaims,
          sam_ownership_validators: samValidation.validators,
          accessory_ownership_validators: accessoryValidation.validators,
          accessory_nested_measurements: accessoryValidation.measurements,
          sample_count: interiorMeasurement.sample_count,
          excluded_sample_count: interiorMeasurement.excluded_sample_count || 0,
          kept_sample_count: interiorMeasurement.sample_count,
          kept_sample_ratio: round3(keptRatio),
          measurement_source: selected.source,
          measurement_authority_v1: authority,
          doctrine: isAccessoryTarget
            ? "nested_interior_stability_then_publish"
            : "measure_validate_publish",
        },
      },
    };
  });

  return {
    regions: out,
    summary: {
      available: true,
      version: "piece_color_ownership_v1",
      corrected_region_count: correctedRegionCount,
      measured_region_count: measuredRegionCount,
      excluded_piece_count: excludedPieceCount,
      validated_sam_region_count: validatedSamRegionCount,
      validated_accessory_region_count: validatedAccessoryRegionCount,
      accessory_abstention_count: accessoryAbstentionCount,
      policy: {
        target_zones: [...ALL_TARGET_ZONES],
        garment_target_zones: [...GARMENT_TARGET_ZONES],
        accessory_target_zones: [...ACCESSORY_TARGET_ZONES],
        dino_targets_only: true,
        minimum_piece_confidence: MIN_PIECE_CONFIDENCE,
        minimum_sam_validator_confidence: MIN_SAM_VALIDATOR_CONFIDENCE,
        minimum_sam_target_overlap: MIN_SAM_TARGET_OVERLAP,
        minimum_sam_mask_overlap: MIN_SAM_MASK_OVERLAP,
        max_excluded_target_ratio: MAX_EXCLUDED_TARGET_RATIO,
        minimum_kept_sample_ratio: MIN_KEPT_SAMPLE_RATIO,
        garment_interior_inset_ratio: DINO_INTERIOR_INSET_RATIO,
        accessory_outer_inset_ratio: ACCESSORY_OUTER_INSET,
        accessory_inner_inset_ratio: ACCESSORY_INNER_INSET,
        accessory_max_delta_e: ACCESSORY_MAX_DELTA_E,
        accessory_minimum_confidence: ACCESSORY_MIN_CONFIDENCE,
        accessory_secondary_minimum_pct: {
          accessory_jewelry: 0.12,
          default: 0.08,
        },
        invariant: "detected_piece_pixels_cannot_vote_as_neighboring_piece_color_without_validation",
        measurement_invariant: "measure_validate_publish",
        dino_bbox_does_not_own_color_authority: true,
        generic_sam_masks_do_not_validate_ownership: true,
        validated_sam_mask_pixels_can_own_color_authority: true,
        nested_accessory_interior_stability_can_validate_ownership: true,
        unstable_accessory_measurements_must_abstain: true,
      },
    },
  };
}
