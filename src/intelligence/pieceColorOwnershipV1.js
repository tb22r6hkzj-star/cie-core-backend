import chroma from "chroma-js";
import { measureDinoInteriorPixelsV1 } from "./dinoInteriorMeasurementV1.js";
import { selectMeasuredColorAuthorityV1 } from "./measurementAuthorityV1.js";

const GARMENT_TARGET_ZONES = new Set(["upper_garment", "lower_garment", "body_garment", "outerwear"]);
const DINO_SOURCE_TYPES = new Set(["grounding_dino", "dino_detection"]);
const MIN_PIECE_CONFIDENCE = 0.45;
const MAX_EXCLUDED_TARGET_RATIO = 0.35;
const MIN_KEPT_SAMPLE_RATIO = 0.25;
const DINO_INTERIOR_INSET_RATIO = 0.12;

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
  let width = Number(box.width);
  let height = Number(box.height);

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
  if (/\bbelt\b/.test(tokens)) return "belt";
  if (zone === "footwear" || /\b(shoe|shoes|sneaker|sneakers|boot|boots)\b/.test(tokens)) return "footwear";
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

function buildMeasurementCandidates(region, interiorMeasurement) {
  const confidence = normalizeConfidence(region?.confidence);
  const ownershipState = "owned";
  const interior = (interiorMeasurement?.colors || []).map((color) => ({
    ...color,
    source: "dino_bbox_interior",
    measurement_source: "dino_bbox_interior",
    ownership_state: ownershipState,
    confidence,
    traceable_to_pixels: true,
  }));

  const rawHex = safeHex(region?.dominant_hex || region?.region_colors?.[0]?.hex || "");
  const raw = rawHex
    ? [{
        hex: rawHex,
        source: "dino_bbox",
        measurement_source: "dino_bbox",
        ownership_state: ownershipState,
        confidence,
        traceable_to_pixels: true,
      }]
    : [];

  return [...interior, ...raw];
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

  const out = regions.map((region) => {
    const targetZone = String(region?.zone || "");
    const isDinoTarget = DINO_SOURCE_TYPES.has(region?.source_type);
    const targetBox = boxes.get(region);
    if (!GARMENT_TARGET_ZONES.has(targetZone) || !isDinoTarget || !targetBox) return region;

    const ownershipClaims = [];
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

    const exclusionBoxes = ownershipClaims.map((claim) => claim.exclusion_box);
    const interiorMeasurement = measureDinoInteriorPixelsV1({
      decodedImage,
      bbox: targetBox,
      exclusions: exclusionBoxes,
      insetRatio: DINO_INTERIOR_INSET_RATIO,
    });
    const keptRatio = interiorMeasurement?.sample_count
      ? interiorMeasurement.sample_count /
        Math.max(1, interiorMeasurement.sample_count + Number(interiorMeasurement?.excluded_sample_count || 0))
      : 0;
    const authority = selectMeasuredColorAuthorityV1(buildMeasurementCandidates(region, interiorMeasurement));
    const selected = authority.selected;

    if (!interiorMeasurement?.available || !selected || keptRatio < MIN_KEPT_SAMPLE_RATIO) {
      return {
        ...region,
        color_debug: {
          ...(region?.color_debug || {}),
          piece_color_ownership_v1: {
            applied: false,
            reason: !interiorMeasurement?.available
              ? interiorMeasurement?.reason || "interior_measurement_unavailable"
              : !selected
                ? "no_publishable_measured_authority"
                : "insufficient_owned_pixels",
            ownership_claims: ownershipClaims,
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
    excludedPieceCount += ownershipClaims.length;
    const rawDominant = safeHex(region?.dominant_hex || region?.region_colors?.[0]?.hex || "");
    if (rawDominant !== selected.hex || ownershipClaims.length) correctedRegionCount += 1;

    const ownedColors = (interiorMeasurement.colors || []).map((color) => ({
      ...color,
      source: "dino_bbox_interior",
      ownership_state: "owned",
      measurement_authority: selected.hex === color.hex ? "selected" : "supporting",
    }));

    return {
      ...region,
      dominant_hex: selected.hex,
      region_colors: ownedColors,
      color_debug: {
        ...(region?.color_debug || {}),
        piece_color_ownership_v1: {
          applied: true,
          authority: "measure_twice_v1_owned_interior_pixels",
          raw_dominant_hex: rawDominant,
          raw_region_colors: Array.isArray(region?.region_colors) ? region.region_colors : [],
          owned_dominant_hex: selected.hex,
          owned_region_colors: ownedColors,
          ownership_claims: ownershipClaims,
          sample_count: interiorMeasurement.sample_count,
          excluded_sample_count: interiorMeasurement.excluded_sample_count || 0,
          kept_sample_count: interiorMeasurement.sample_count,
          kept_sample_ratio: round3(keptRatio),
          measurement_source: selected.source,
          measurement_authority_v1: authority,
          doctrine: "measure_twice_publish_once",
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
      policy: {
        target_zones: [...GARMENT_TARGET_ZONES],
        dino_targets_only: true,
        minimum_piece_confidence: MIN_PIECE_CONFIDENCE,
        max_excluded_target_ratio: MAX_EXCLUDED_TARGET_RATIO,
        minimum_kept_sample_ratio: MIN_KEPT_SAMPLE_RATIO,
        interior_inset_ratio: DINO_INTERIOR_INSET_RATIO,
        invariant: "detected_piece_pixels_cannot_vote_as_neighboring_garment_color",
        measurement_invariant: "measure_twice_publish_once",
        dino_bbox_does_not_own_color_authority: true,
      },
    },
  };
}
