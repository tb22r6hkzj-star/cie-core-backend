import chroma from "chroma-js";

const GARMENT_TARGET_ZONES = new Set(["upper_garment", "lower_garment", "body_garment", "outerwear"]);
const DINO_SOURCE_TYPES = new Set(["grounding_dino", "dino_detection"]);
const MIN_PIECE_CONFIDENCE = 0.45;
const MAX_EXCLUDED_TARGET_RATIO = 0.35;
const MIN_KEPT_SAMPLE_RATIO = 0.25;

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

function contains(box, x, y) {
  return !!box && x >= box.x && x <= box.right && y >= box.y && y <= box.bottom;
}

function bucketOwnedPixels(decodedImage, targetBox, exclusions = []) {
  const width = Number(decodedImage?.width || 0);
  const height = Number(decodedImage?.height || 0);
  const data = decodedImage?.data;
  if (!width || !height || !data || !targetBox) return null;

  const insetX = targetBox.width * 0.025;
  const insetY = targetBox.height * 0.025;
  const x0 = Math.max(0, Math.floor((targetBox.x + insetX) * width));
  const y0 = Math.max(0, Math.floor((targetBox.y + insetY) * height));
  const x1 = Math.min(width, Math.ceil((targetBox.right - insetX) * width));
  const y1 = Math.min(height, Math.ceil((targetBox.bottom - insetY) * height));
  if (x1 <= x0 || y1 <= y0) return null;

  const pixelArea = (x1 - x0) * (y1 - y0);
  const stride = Math.max(1, Math.floor(Math.sqrt(pixelArea / 14000)));
  const buckets = new Map();
  let totalSamples = 0;
  let excludedSamples = 0;
  let keptSamples = 0;

  for (let py = y0; py < y1; py += stride) {
    for (let px = x0; px < x1; px += stride) {
      const nx = (px + 0.5) / width;
      const ny = (py + 0.5) / height;
      totalSamples += 1;
      if (exclusions.some((box) => contains(box, nx, ny))) {
        excludedSamples += 1;
        continue;
      }
      const idx = (py * width + px) * 4;
      const alpha = Number(data[idx + 3] ?? 255);
      if (alpha < 32) continue;
      const r = Number(data[idx] || 0);
      const g = Number(data[idx + 1] || 0);
      const b = Number(data[idx + 2] || 0);
      const key = `${Math.round(r / 20)}_${Math.round(g / 20)}_${Math.round(b / 20)}`;
      if (!buckets.has(key)) buckets.set(key, { count: 0, r: 0, g: 0, b: 0 });
      const bucket = buckets.get(key);
      bucket.count += 1;
      bucket.r += r;
      bucket.g += g;
      bucket.b += b;
      keptSamples += 1;
    }
  }

  return { buckets, totalSamples, excludedSamples, keptSamples };
}

function buildOwnedColors(sampled, limit = 6) {
  if (!sampled?.keptSamples) return [];
  const candidates = [...sampled.buckets.values()]
    .map((bucket) => ({
      count: bucket.count,
      rgb: [
        Math.round(bucket.r / bucket.count),
        Math.round(bucket.g / bucket.count),
        Math.round(bucket.b / bucket.count),
      ],
    }))
    .sort((a, b) => b.count - a.count);

  const clusters = [];
  for (const candidate of candidates) {
    const hex = safeHex(chroma(candidate.rgb).hex());
    if (!hex) continue;
    const match = clusters.find((cluster) => chroma.distance(cluster.hex, hex, "lab") < 11);
    if (match) {
      const nextCount = match.count + candidate.count;
      match.rgb = [0, 1, 2].map((i) => Math.round((match.rgb[i] * match.count + candidate.rgb[i] * candidate.count) / nextCount));
      match.count = nextCount;
      match.hex = safeHex(chroma(match.rgb).hex());
    } else {
      clusters.push({ hex, rgb: candidate.rgb, count: candidate.count });
    }
  }

  return clusters
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
    .map((cluster) => ({
      hex: cluster.hex,
      pct: round3(cluster.count / sampled.keptSamples),
      source: "piece_color_ownership_v1",
    }));
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
    if (!ownershipClaims.length) return region;

    const exclusionBoxes = ownershipClaims.map((claim) => claim.exclusion_box);
    const sampled = bucketOwnedPixels(decodedImage, targetBox, exclusionBoxes);
    const keptRatio = sampled?.totalSamples ? sampled.keptSamples / sampled.totalSamples : 0;
    const ownedColors = keptRatio >= MIN_KEPT_SAMPLE_RATIO ? buildOwnedColors(sampled) : [];
    if (!ownedColors.length) {
      return {
        ...region,
        color_debug: {
          ...(region?.color_debug || {}),
          piece_color_ownership_v1: {
            applied: false,
            reason: "insufficient_owned_pixels",
            ownership_claims: ownershipClaims,
            sample_count: sampled?.totalSamples || 0,
            excluded_sample_count: sampled?.excludedSamples || 0,
            kept_sample_count: sampled?.keptSamples || 0,
            kept_sample_ratio: round3(keptRatio),
          },
        },
      };
    }

    correctedRegionCount += 1;
    excludedPieceCount += ownershipClaims.length;
    const rawDominant = safeHex(region?.dominant_hex || region?.region_colors?.[0]?.hex || "");
    return {
      ...region,
      dominant_hex: ownedColors[0].hex,
      region_colors: ownedColors,
      color_debug: {
        ...(region?.color_debug || {}),
        piece_color_ownership_v1: {
          applied: true,
          authority: "owned_pixels_after_piece_exclusion",
          raw_dominant_hex: rawDominant,
          raw_region_colors: Array.isArray(region?.region_colors) ? region.region_colors : [],
          owned_dominant_hex: ownedColors[0].hex,
          owned_region_colors: ownedColors,
          ownership_claims: ownershipClaims,
          sample_count: sampled.totalSamples,
          excluded_sample_count: sampled.excludedSamples,
          kept_sample_count: sampled.keptSamples,
          kept_sample_ratio: round3(keptRatio),
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
      excluded_piece_count: excludedPieceCount,
      policy: {
        target_zones: [...GARMENT_TARGET_ZONES],
        dino_targets_only: true,
        minimum_piece_confidence: MIN_PIECE_CONFIDENCE,
        max_excluded_target_ratio: MAX_EXCLUDED_TARGET_RATIO,
        minimum_kept_sample_ratio: MIN_KEPT_SAMPLE_RATIO,
        invariant: "detected_piece_pixels_cannot_vote_as_neighboring_garment_color",
      },
    },
  };
}
