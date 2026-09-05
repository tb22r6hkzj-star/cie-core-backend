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
  if (!target) return { match: null, reason: "recovery_target_box_missing" };
  const targetArea = target.w * target.h;
  const blocked = exclusions(region);
  let best = null;
  let sawOverlap = false;
  let sawTooBroad = false;
  let sawExclusionConflict = false;

  for (const sam of Array.isArray(samRegions) ? samRegions : []) {
    if (sam?.source_type !== "sam_segment" || !sam?.mask_url || !sam?.mask_geometry) continue;
    if (confidence01(sam?.confidence) < 0.5) continue;
    const mask = boxOf(sam);
    if (!mask) continue;
    const maskArea = mask.w * mask.h;
    const intersection = overlapArea(target, mask);
    if (!intersection) continue;
    sawOverlap = true;

    const targetCoverage = intersection / Math.max(targetArea, 1e-9);
    const maskCoverage = intersection / Math.max(maskArea, 1e-9);
    const blockedRatio = exclusionRatio(mask, blocked);
    const sizeRatio = maskArea / Math.max(targetArea, 1e-9);

    // Recovery is intentionally different from the strict first pass:
    // it tolerates tiny/discontinuous jewelry masks, but tightens contamination limits.
    if (targetCoverage < 0.1 || maskCoverage < 0.55) continue;
    if (sizeRatio > 1.25) {
      sawTooBroad = true;
      continue;
    }
    if (blockedRatio > 0.12) {
      sawExclusionConflict = true;
      continue;
    }

    const colors = Array.isArray(sam?.region_colors) ? sam.region_colors : [];
    const pixelCount = colors.reduce((sum, row) => sum + Math.max(0, Number(row?.pixel_count || 0)), 0);
    if (!colors.length || pixelCount < 6) continue;

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
  if (sawExclusionConflict) return { match: null, reason: "recovery_skin_or_exclusion_contamination" };
  if (sawTooBroad) return { match: null, reason: "recovery_mask_too_broad" };
  if (sawOverlap) return { match: null, reason: "recovery_mask_insufficient_owned_pixels_or_overlap" };
  return { match: null, reason: "recovery_no_overlapping_mask" };
}

export function applyAccessoryMaskRecoveryV1(regions = [], samRegions = []) {
  let attempted = 0;
  let recovered = 0;
  const failureReasons = {};

  const out = (Array.isArray(regions) ? regions : []).map((region) => {
    if (!isJewelryTarget(region)) return region;
    if (region?.positive_accessory_mask_v1?.validated === true) return region;

    attempted += 1;
    const result = recoveryCandidate(region, samRegions);
    if (!result.match) {
      failureReasons[result.reason] = (failureReasons[result.reason] || 0) + 1;
      return {
        ...region,
        accessory_mask_recovery_v1: {
          version: "accessory_mask_recovery_v1",
          attempted: true,
          recovered: false,
          reason: result.reason,
          authority_owner: "visioncore",
          retry_budget: 1,
        },
      };
    }

    recovered += 1;
    const { sam, targetCoverage, maskCoverage, blockedRatio, pixelCount, score } = result.match;
    const colors = (Array.isArray(sam?.region_colors) ? sam.region_colors : []).map((row) => ({ ...row }));
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
        strict_first_pass_remains_primary: true,
        semantic_exclusion_overlap_must_be_low: true,
        minimum_recovered_pixel_count: 6,
        legacy_color_fallback_allowed: false,
      },
    },
  };
}
