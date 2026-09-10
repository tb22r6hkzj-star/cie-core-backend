const ZONE_COVERAGE_BOUNDS = Object.freeze({
  upper_garment: [0.003, 0.72],
  lower_garment: [0.003, 0.72],
  body_garment: [0.005, 0.82],
  outerwear: [0.003, 0.78],
  footwear: [0.00005, 0.25],
  accessory_jewelry: [0.000005, 0.08],
  belt: [0.00002, 0.12],
  bag: [0.0001, 0.35],
});

function normalizedBox(box = null) {
  if (!box) return null;
  const x = Number(box.x ?? box.x_min ?? box.left);
  const y = Number(box.y ?? box.y_min ?? box.top);
  const width = Number(box.w ?? box.width ?? (Number(box.x_max ?? box.right) - x));
  const height = Number(box.h ?? box.height ?? (Number(box.y_max ?? box.bottom) - y));
  if (![x, y, width, height].every(Number.isFinite) || x < 0 || y < 0 || width <= 0 || height <= 0) return null;
  if (x > 1 || y > 1 || width > 1 || height > 1) return null;
  const right = Math.min(1, x + width);
  const bottom = Math.min(1, y + height);
  if (right <= x || bottom <= y) return null;
  return { x, y, width: right - x, height: bottom - y, right, bottom };
}

function area(box) {
  return box ? box.width * box.height : 0;
}

function intersectionArea(a, b) {
  if (!a || !b) return 0;
  const width = Math.max(0, Math.min(a.right, b.right) - Math.max(a.x, b.x));
  const height = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y));
  return width * height;
}

function round4(value) {
  return Math.round(Number(value || 0) * 10000) / 10000;
}

function evaluate(region, target) {
  const zone = String(region?.zone || target?.zone || "");
  const bounds = ZONE_COVERAGE_BOUNDS[zone] || null;
  const maskBox = normalizedBox(region?.mask_geometry?.bbox);
  const detectorBox = normalizedBox(target?.bbox);
  const coverage = Number(region?.mask_geometry?.coverage || region?.coverage || area(maskBox));
  const overlap = intersectionArea(maskBox, detectorBox);
  const detectorOverlapRatio = overlap / Math.max(area(detectorBox), 1e-9);
  const maskOverlapRatio = overlap / Math.max(area(maskBox), 1e-9);
  const accessory = ["footwear", "accessory_jewelry", "belt", "bag"].includes(zone);
  const minimumOverlap = accessory ? 0.08 : 0.12;
  const reasons = [];
  if (!bounds) reasons.push("unsupported_target_zone");
  if (!maskBox) reasons.push("mask_geometry_missing");
  if (!detectorBox) reasons.push("detector_box_missing");
  if (bounds && (coverage < bounds[0] || coverage > bounds[1])) reasons.push("mask_coverage_out_of_zone_bounds");
  if (maskBox && detectorBox && detectorOverlapRatio < minimumOverlap) reasons.push("insufficient_detector_overlap");
  if (maskBox && detectorBox && maskOverlapRatio < minimumOverlap) reasons.push("insufficient_mask_overlap");
  return {
    version: "target_conditioned_mask_validation_v1",
    validated: reasons.length === 0,
    reasons,
    zone,
    coverage: round4(coverage),
    coverage_bounds: bounds,
    detector_overlap_ratio: round4(detectorOverlapRatio),
    mask_overlap_ratio: round4(maskOverlapRatio),
    detector_region_id: target?.detector_region_id || null,
    authority: reasons.length ? "rejected_before_pixel_authority" : "validated_spatial_mask",
  };
}

export function validateTargetConditionedMaskRegionsV1({ regions = [], plan = {} } = {}) {
  const targets = Array.isArray(plan?.targets) ? plan.targets : [];
  const targetById = new Map(targets.map((target) => [String(target?.id || ""), target]));
  const evaluations = [];
  const validatedRegions = [];
  for (const region of Array.isArray(regions) ? regions : []) {
    const target = targetById.get(String(region?.id || "")) || null;
    const validation = evaluate(region, target);
    evaluations.push({ region_id: region?.id || null, target: target || null, ...validation });
    if (!validation.validated) continue;
    validatedRegions.push({
      ...region,
      target_conditioned_mask_v1: {
        ...(region?.target_conditioned_mask_v1 || {}),
        spatially_validated: true,
        spatial_validation: validation,
      },
    });
  }
  return {
    version: "target_conditioned_mask_validation_v1",
    regions: validatedRegions,
    evaluations,
    validated_count: validatedRegions.length,
    rejected_count: evaluations.length - validatedRegions.length,
  };
}
