const TARGET_PATTERN = /\b(watch|earring|earrings|ear stud|stud earring|bracelet|ring|necklace|chain|pendant|brooch|pin)\b/i;

function confidence01(value) {
  const n = Number(value || 0);
  return Math.max(0, Math.min(1, n > 1 ? n / 100 : n));
}

function boxOf(value = {}) {
  const raw = value?.normalized_bbox || value?.mask_geometry?.bbox || value?.bbox || value?.bounding_box || value;
  const x = Number(raw?.x_min ?? raw?.x ?? raw?.left);
  const y = Number(raw?.y_min ?? raw?.y ?? raw?.top);
  const w = Number(raw?.width ?? raw?.w ?? (Number(raw?.x_max ?? raw?.right) - x));
  const h = Number(raw?.height ?? raw?.h ?? (Number(raw?.y_max ?? raw?.bottom) - y));
  if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) return null;
  return { x, y, w, h, right: x + w, bottom: y + h };
}

function overlapArea(a, b) {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.right, b.right);
  const y2 = Math.min(a.bottom, b.bottom);
  return Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
}

function tokens(region = {}) {
  return [region?.label, region?.segment_label, region?.category, region?.object_type, region?.accessory_type]
    .filter(Boolean)
    .join(" ");
}

function isJewelryTarget(region = {}) {
  return String(region?.zone || "") === "accessory_jewelry" && TARGET_PATTERN.test(tokens(region));
}

function choosePositiveMask(region, samRegions = []) {
  const target = boxOf(region);
  if (!target) return null;
  const targetArea = target.w * target.h;
  let best = null;

  for (const sam of Array.isArray(samRegions) ? samRegions : []) {
    if (sam?.source_type !== "sam_segment" || !sam?.mask_url || !sam?.mask_geometry) continue;
    if (confidence01(sam?.confidence) < 0.45) continue;
    const mask = boxOf(sam);
    if (!mask) continue;
    const maskArea = mask.w * mask.h;
    const intersection = overlapArea(target, mask);
    if (!intersection) continue;
    const targetCoverage = intersection / Math.max(targetArea, 1e-9);
    const maskCoverage = intersection / Math.max(maskArea, 1e-9);
    if (targetCoverage < 0.35 || maskCoverage < 0.18) continue;
    if (maskArea > targetArea * 4.5) continue;
    const score = Math.min(targetCoverage, 1) * 0.7 + Math.min(maskCoverage, 1) * 0.3;
    if (!best || score > best.score) best = { sam, score, targetCoverage, maskCoverage };
  }
  return best;
}

export function attachAccessoryPositiveMaskOwnershipV1(dinoRegions = [], samRegions = []) {
  return (Array.isArray(dinoRegions) ? dinoRegions : []).map((region) => {
    if (!isJewelryTarget(region)) return region;
    const match = choosePositiveMask(region, samRegions);
    if (!match) {
      return {
        ...region,
        positive_accessory_mask_v1: {
          version: "accessory_positive_mask_ownership_v1",
          validated: false,
          reason: "positive_accessory_mask_required",
          authority_owner: "visioncore",
        },
      };
    }
    const colors = Array.isArray(match.sam?.region_colors) ? match.sam.region_colors.map((c) => ({ ...c })) : [];
    return {
      ...region,
      positive_accessory_mask_v1: {
        version: "accessory_positive_mask_ownership_v1",
        validated: true,
        reason: "dino_target_sam_positive_mask_overlap",
        authority_owner: "visioncore",
        sam_region_id: match.sam?.id || match.sam?.region_id || null,
        mask_url: match.sam?.mask_url || null,
        mask_geometry: match.sam?.mask_geometry || null,
        target_overlap_ratio: Number(match.targetCoverage.toFixed(3)),
        mask_overlap_ratio: Number(match.maskCoverage.toFixed(3)),
        confidence: confidence01(match.sam?.confidence),
        region_colors: colors,
      },
      accessory_positive_mask_colors: colors,
    };
  });
}

export function accessoryRequiresPositiveMaskV1(region = {}) {
  return isJewelryTarget(region);
}
