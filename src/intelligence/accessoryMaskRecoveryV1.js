const TARGET_PATTERN = /\b(watch|earring|earrings|ear stud|stud earring)\b/i;

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

function isRecoveryTarget(region = {}) {
  return String(region?.zone || "") === "accessory_jewelry" && TARGET_PATTERN.test(tokens(region));
}

function exclusions(region = {}) {
  return (Array.isArray(region?.accessory_semantic_exclusions_v2) ? region.accessory_semantic_exclusions_v2 : [])
    .filter((row) => confidence01(row?.confidence) >= 0.6)
    .map((row) => boxOf(row?.bbox || row))
    .filter(Boolean);
}

function exclusionRatio(mask, rows = []) {
  const area = Math.max(mask.w * mask.h, 1e-9);
  let excluded = 0;
  for (const row of rows) excluded += overlapArea(mask, row);
  return Math.min(1, excluded / area);
}

function recoveryCandidate(region, samRegions = []) {
  const target = boxOf(region);
  if (!target) return { match: null, reason: "no_mask" };
  const targetArea = target.w * target.h;
  const blocked = exclusions(region);
  let best = null;
  let sawMask = false;
  let sawOverlap = false;
  let sawTooSmall = false;
  let sawLowTargetOverlap = false;
  let sawSkinContamination = false;
  let sawInsufficientPixels = false;

  for (const sam of Array.isArray(samRegions) ? samRegions : []) {
    if (sam?.source_type !== "sam_segment" || !sam?.mask_url || !sam?.mask_geometry) continue;
    if (confidence01(sam?.confidence) < 0.5) continue;
    const mask = boxOf(sam);
    if (!mask) continue;
    sawMask = true;

    const maskArea = mask.w * mask.h;
    const intersection = overlapArea(target, mask);
    if (!intersection) continue;
    sawOverlap = true;

    const targetCoverage = intersection / Math.max(targetArea, 1e-9);
    const maskCoverage = intersection / Math.max(maskArea, 1e-9);
    const blockedRatio = exclusionRatio(mask, blocked);
    const sizeRatio = maskArea / Math.max(targetArea, 1e-9);
    const microCropMask = sam?.micro_crop_mask_v1 === true;
    const geometry = sam?.mask_geometry || {};
    const fillRatio = Number(geometry?.fill_ratio || 0);
    const imageEdgeRatio = Number(geometry?.image_edge_ratio || 0);
    const sizeRatioFloor = microCropMask ? 0.005 : 0.025;
    const targetCoverageFloor = microCropMask ? 0.005 : 0.1;
    const maskCoverageFloor = microCropMask ? 0.8 : 0.55;

    // Recovery accepts small/discontinuous jewelry masks, but it is stricter
    // than the first pass on contamination and on pixel ownership.
    if (sizeRatio < sizeRatioFloor || maskArea < 1e-6) {
      sawTooSmall = true;
      continue;
    }
    if (targetCoverage < targetCoverageFloor || maskCoverage < maskCoverageFloor) {
      sawLowTargetOverlap = true;
      continue;
    }
    if (sizeRatio > 1.25) {
      sawLowTargetOverlap = true;
      continue;
    }
    if (blockedRatio > 0.12) {
      sawSkinContamination = true;
      continue;
    }
    if (microCropMask && (fillRatio < 0.55 || imageEdgeRatio > 0.12)) {
      sawSkinContamination = true;
      continue;
    }

    const colors = Array.isArray(sam?.region_colors) ? sam.region_colors : [];
    const colorPixelCount = colors.reduce((sum, row) => sum + Math.max(0, Number(row?.pixel_count || 0)), 0);
    const pixelCount = Math.max(colorPixelCount, Number(geometry?.pixel_count || 0));
    if (!colors.length || pixelCount < 6) {
      sawInsufficientPixels = true;
      continue;
    }

    const compactness = Math.min(1, targetArea / Math.max(maskArea, 1e-9));
    const score = Math.min(maskCoverage, 1) * 0.4
      + Math.min(targetCoverage, 1) * 0.25
      + compactness * 0.2
      + (1 - blockedRatio) * 0.15;

    if (!best || score > best.score) {
      best = { sam, score, targetCoverage, maskCoverage, blockedRatio, pixelCount, sizeRatio };
    }
  }

  if (best) return { match: best, reason: "recovered_target_conditioned_mask" };
  if (sawSkinContamination) return { match: null, reason: "skin_contamination" };
  if (sawInsufficientPixels) return { match: null, reason: "insufficient_usable_pixels" };
  if (sawTooSmall) return { match: null, reason: "mask_too_small" };
  if (sawLowTargetOverlap || sawOverlap) return { match: null, reason: "low_target_overlap" };
  if (sawMask) return { match: null, reason: "low_target_overlap" };
  return { match: null, reason: "no_mask" };
}

export function applyAccessoryMaskRecoveryV1(regions = [], samRegions = []) {
  let attempted = 0;
  let recovered = 0;
  const failureReasons = {};

  const out = (Array.isArray(regions) ? regions : []).map((region) => {
    if (!isRecoveryTarget(region)) return region;
    if (region?.positive_accessory_mask_v1?.validated === true) return region;

    attempted += 1;
    const result = recoveryCandidate(region, samRegions);
    if (!result.match) {
      failureReasons[result.reason] = (failureReasons[result.reason] || 0) + 1;
      return {
        ...region,
        accessory_positive_mask_colors: [],
        accessory_mask_recovery_v1: {
          version: "accessory_mask_recovery_v1",
          attempted: true,
          recovered: false,
          reason: result.reason,
          authority_owner: "visioncore",
          retry_budget: 1,
          legacy_color_fallback_allowed: false,
        },
      };
    }

    recovered += 1;
    const { sam, targetCoverage, maskCoverage, blockedRatio, pixelCount, score } = result.match;
    const colors = (Array.isArray(sam?.region_colors) ? sam.region_colors : []).map((row) => {
      const explicitPixelCount = Math.max(0, Number(row?.pixel_count || row?.sample_count || 0));
      const measuredShare = Math.max(0, Number(row?.pct ?? row?.percentage ?? 0));
      return {
        ...row,
        pixel_count: explicitPixelCount || Math.max(1, Math.round(measuredShare * pixelCount)),
        measurement_source: row?.measurement_source || "accessory_positive_mask_pixels",
        source_class: row?.source_class || "object",
      };
    });
    return {
      ...region,
      positive_accessory_mask_v1: {
        version: "accessory_positive_mask_ownership_v2",
        validated: true,
        reason: "recovered_target_conditioned_sam_mask",
        authority_owner: "visioncore",
        recovery_source: "accessory_mask_recovery_v1",
        sam_region_id: sam?.id || sam?.region_id || null,
        mask_url: sam?.mask_url || null,
        mask_geometry: sam?.mask_geometry || null,
        target_overlap_ratio: Number(targetCoverage.toFixed(3)),
        mask_overlap_ratio: Number(maskCoverage.toFixed(3)),
        semantic_exclusion_overlap_ratio: Number(blockedRatio.toFixed(3)),
        confidence: confidence01(sam?.confidence),
        region_colors: colors,
      },
      accessory_positive_mask_colors: colors,
      accessory_mask_recovery_v1: {
        version: "accessory_mask_recovery_v1",
        attempted: true,
        recovered: true,
        reason: "recovered_target_conditioned_mask",
        authority_owner: "visioncore",
        retry_budget: 1,
        pixel_count: pixelCount,
        score: Number(score.toFixed(3)),
        legacy_color_fallback_allowed: false,
      },
    };
  });

  return {
    regions: out,
    summary: {
      version: "accessory_mask_recovery_v1",
      attempted_count: attempted,
      recovered_count: recovered,
      abstained_count: attempted - recovered,
      failure_reasons: failureReasons,
      policy: {
        one_bounded_recovery_pass: true,
        recovery_targets: ["watch", "earrings"],
        strict_first_pass_remains_primary: true,
        semantic_exclusion_overlap_must_be_low: true,
        minimum_recovered_pixel_count: 6,
        legacy_color_fallback_allowed: false,
      },
    },
  };
}
