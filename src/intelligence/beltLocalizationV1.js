const BELT_PATTERN = /\b(belt|waist belt|belt buckle|waistband belt)\b/i;

function confidence01(value) {
  const n = Number(value || 0);
  return Math.max(0, Math.min(1, n > 1 ? n / 100 : n));
}

function boxOf(value = {}) {
  const raw = value?.bbox || value?.mask_geometry?.bbox || value;
  const x = Number(raw?.x_min ?? raw?.x);
  const y = Number(raw?.y_min ?? raw?.y);
  const w = Number(raw?.width ?? raw?.w ?? (Number(raw?.x_max) - x));
  const h = Number(raw?.height ?? raw?.h ?? (Number(raw?.y_max) - y));
  if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) return null;
  return { x, y, w, h, right: x + w, bottom: y + h };
}

function overlap(a, b) {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.right, b.right);
  const y2 = Math.min(a.bottom, b.bottom);
  return Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
}

function beltTokens(region = {}) {
  return [region?.label, region?.segment_label, region?.category, region?.object_type, region?.accessory_type]
    .filter(Boolean)
    .join(" ");
}

export function evaluateBeltCandidateV1(region = {}, samRegions = []) {
  const bbox = boxOf(region);
  const confidence = confidence01(region?.confidence);
  const semanticMatch = BELT_PATTERN.test(beltTokens(region));
  const centerY = bbox ? bbox.y + bbox.h / 2 : null;
  const aspectRatio = bbox ? bbox.w / bbox.h : 0;
  const area = bbox ? bbox.w * bbox.h : 0;
  const geometryValid = Boolean(
    bbox && bbox.x >= 0 && bbox.y >= 0 && bbox.right <= 1.001 && bbox.bottom <= 1.001 &&
    centerY >= 0.28 && centerY <= 0.67 && bbox.w >= 0.12 && bbox.w <= 0.86 &&
    bbox.h >= 0.012 && bbox.h <= 0.16 && aspectRatio >= 2 && area <= 0.1
  );

  let bestSam = null;
  if (bbox && semanticMatch && geometryValid && confidence >= 0.55) {
    for (const sam of Array.isArray(samRegions) ? samRegions : []) {
      if (sam?.source_type !== "sam_segment" || !sam?.mask_url || !sam?.mask_geometry) continue;
      if (confidence01(sam?.confidence) < 0.55) continue;
      const samBox = boxOf(sam);
      if (!samBox) continue;
      const intersection = overlap(bbox, samBox);
      const beltCoverage = intersection / Math.max(area, 1e-9);
      const maskArea = samBox.w * samBox.h;
      const maskCoverage = intersection / Math.max(maskArea, 1e-9);
      const maskAspect = samBox.w / samBox.h;
      if (beltCoverage < 0.55 || maskCoverage < 0.18 || maskAspect < 1.4 || maskArea > area * 5) continue;
      const score = Math.min(beltCoverage, 1) * 0.65 + Math.min(maskCoverage, 1) * 0.35;
      if (!bestSam || score > bestSam.score) bestSam = { sam, score, beltCoverage, maskCoverage };
    }
  }

  const samValidated = Boolean(bestSam);
  return {
    semantic_match: semanticMatch,
    confidence_valid: confidence >= 0.55,
    geometry_valid: geometryValid,
    sam_validated: samValidated,
    validated: semanticMatch && confidence >= 0.55 && geometryValid && samValidated,
    reason: !semanticMatch ? "not_belt" : confidence < 0.55 ? "low_confidence" : !geometryValid ? "invalid_waist_geometry" : !samValidated ? "sam_confirmation_required" : "dino_sam_waist_confirmed",
    sam_region_id: bestSam?.sam?.id || null,
    belt_overlap_ratio: bestSam ? Number(bestSam.beltCoverage.toFixed(3)) : 0,
    sam_overlap_ratio: bestSam ? Number(bestSam.maskCoverage.toFixed(3)) : 0,
  };
}

export function attachBeltLocalizationV1(dinoRegions = [], samRegions = []) {
  return (Array.isArray(dinoRegions) ? dinoRegions : []).map((region) => {
    if (!BELT_PATTERN.test(beltTokens(region))) return region;
    const belt_localization = evaluateBeltCandidateV1(region, samRegions);
    return {
      ...region,
      belt_localization,
      spatially_validated: belt_localization.validated,
      publication_eligible: false,
      shadow_only: true,
    };
  });
}
