const TARGETS = Object.freeze({
  watch: { maxArea: 0.035, maxWidth: 0.24, maxHeight: 0.24, margin: 0.08 },
  earrings: { maxArea: 0.012, maxWidth: 0.14, maxHeight: 0.14, margin: 0.12 },
});

function clamp01(v) { return Math.max(0, Math.min(1, Number(v) || 0)); }
function area(box) { return box ? box.width * box.height : 0; }

export function normalizeMicroCropBoxV1(box = {}) {
  const x = Number(box?.x), y = Number(box?.y), width = Number(box?.width), height = Number(box?.height);
  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return null;
  if (x < 0 || y < 0 || x + width > 1 || y + height > 1) return null;
  return { x, y, width, height, right: x + width, bottom: y + height };
}

function intersect(a, b) {
  if (!a || !b) return null;
  const x = Math.max(a.x, b.x), y = Math.max(a.y, b.y);
  const right = Math.min(a.right, b.right), bottom = Math.min(a.bottom, b.bottom);
  if (right <= x || bottom <= y) return null;
  return { x, y, width: right - x, height: bottom - y, right, bottom };
}

export function validateAccessoryMicroCropV1({ targetType, locatorBox, detectorBox = null, locatorConfidence = 0, spatialSource = "openai_locator", detectorValidated = false } = {}) {
  const config = TARGETS[targetType];
  const locator = normalizeMicroCropBoxV1(locatorBox);
  const detector = detectorBox ? normalizeMicroCropBoxV1(detectorBox) : null;
  if (!config) return { accepted: false, reason: "unsupported_target" };
  if (!locator) return { accepted: false, reason: "invalid_locator_box" };
  if (spatialSource === "visioncore_detector" && detectorValidated !== true) return { accepted: false, reason: "visioncore_detector_not_validated" };
  if (spatialSource !== "visioncore_detector" && Number(locatorConfidence) < 0.72) return { accepted: false, reason: "locator_confidence_below_floor" };
  if (area(locator) > config.maxArea || locator.width > config.maxWidth || locator.height > config.maxHeight) return { accepted: false, reason: "locator_box_too_broad" };

  let overlap = null;
  if (detector) {
    const intersection = intersect(locator, detector);
    overlap = intersection ? area(intersection) / Math.max(area(locator), 1e-6) : 0;
    if (overlap < 0.35) return { accepted: false, reason: "locator_detector_spatial_disagreement", overlap };
  }

  const mx = locator.width * config.margin, my = locator.height * config.margin;
  const x = clamp01(locator.x - mx), y = clamp01(locator.y - my);
  const right = clamp01(locator.right + mx), bottom = clamp01(locator.bottom + my);
  const crop = { x, y, width: right - x, height: bottom - y, right, bottom };
  return {
    accepted: true,
    reason: spatialSource === "visioncore_detector"
      ? "visioncore_detector_micro_crop_spatially_validated"
      : "openai_micro_locator_spatially_validated",
    target_type: targetType,
    crop,
    locator_box: locator,
    detector_overlap: overlap,
    policy: {
      crop_is_spatial_hint_only: true,
      openai_color_authority: false,
      visioncore_remeasurement_required: true,
      publish_only_after_pixel_ownership_validation: true,
    },
  };
}

export function buildAccessoryMicroCropPlanV1({ targetType, locatorResult = {}, detectorBox = null, spatialSource = "openai_locator", detectorValidated = false } = {}) {
  const validation = validateAccessoryMicroCropV1({
    targetType,
    locatorBox: locatorResult?.bbox,
    detectorBox,
    locatorConfidence: locatorResult?.confidence,
    spatialSource,
    detectorValidated,
  });
  return {
    version: "accessory_micro_crop_v1",
    authority_owner: "visioncore",
    target_type: targetType,
    execution_allowed: validation.accepted === true,
    crop: validation.accepted ? validation.crop : null,
    reason: validation.reason,
    validation,
    max_detector_passes: 1,
    max_segmentation_passes: 1,
    external_color_authority: false,
  };
}
