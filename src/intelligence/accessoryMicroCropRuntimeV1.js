import { buildAccessoryMicroCropPlanV1 } from "./accessoryMicroCropV1.js";
import { runOpenAIAccessoryMicroLocatorV1 } from "./external/openAIAccessoryMicroLocatorV1.js";

function normalizeBox(box = {}) {
  const x = Number(box?.x ?? box?.x_min ?? box?.left);
  const y = Number(box?.y ?? box?.y_min ?? box?.top);
  const right = Number(box?.right ?? box?.x_max ?? (x + Number(box?.width ?? box?.w)));
  const bottom = Number(box?.bottom ?? box?.y_max ?? (y + Number(box?.height ?? box?.h)));
  if (![x, y, right, bottom].every(Number.isFinite) || right <= x || bottom <= y) return null;
  if (x < 0 || y < 0 || right > 1 || bottom > 1) return null;
  return { x, y, width: right - x, height: bottom - y, right, bottom };
}

function intersect(a, b) {
  if (!a || !b) return null;
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const right = Math.min(a.right, b.right);
  const bottom = Math.min(a.bottom, b.bottom);
  if (right <= x || bottom <= y) return null;
  return { x, y, width: right - x, height: bottom - y, right, bottom };
}

export function clipDetectionToMicroCropV1(detection = {}, crop = null) {
  const box = normalizeBox(detection?.bbox || detection?.bounding_box || detection);
  const normalizedCrop = normalizeBox(crop);
  const clipped = intersect(box, normalizedCrop);
  if (!box || !normalizedCrop || !clipped) return null;
  return {
    ...detection,
    bbox: { x: clipped.x, y: clipped.y, width: clipped.width, height: clipped.height },
    micro_crop_applied: true,
    micro_crop_source: "openai_spatial_hint_visioncore_validated",
  };
}

export async function executeAccessoryMicroCropRuntimeV1({
  imageUrl,
  targetType,
  detectorBox = null,
  runLocator = runOpenAIAccessoryMicroLocatorV1,
  runDetector,
  runSegmenter,
  apiKey = process.env.OPENAI_API_KEY,
  model = process.env.OPENAI_SEMANTIC_MODEL || "gpt-5.6-luna",
} = {}) {
  if (!["watch", "earrings"].includes(targetType)) {
    return { ok: false, skipped: true, reason: "unsupported_target", target_type: targetType || null };
  }
  const locator = await runLocator({ imageUrl, targetType, apiKey, model });
  const plan = buildAccessoryMicroCropPlanV1({ targetType, locatorResult: locator, detectorBox });
  if (!locator?.found || !plan.execution_allowed) {
    return { ok: true, skipped: true, target_type: targetType, locator, plan, reason: plan.reason || locator?.reason || "micro_crop_not_allowed" };
  }
  if (typeof runDetector !== "function") {
    return { ok: true, skipped: true, target_type: targetType, locator, plan, reason: "detector_executor_missing" };
  }
  const detected = await runDetector({ imageUrl, targetType, crop: plan.crop, maxPasses: 1 });
  const rows = Array.isArray(detected?.detections) ? detected.detections : Array.isArray(detected) ? detected : [];
  const clippedDetections = rows.map((row) => clipDetectionToMicroCropV1(row, plan.crop)).filter(Boolean);
  let segmentation = null;
  if (clippedDetections.length && typeof runSegmenter === "function") {
    segmentation = await runSegmenter({ imageUrl, targetType, crop: plan.crop, detections: clippedDetections, maxPasses: 1 });
  }
  return {
    ok: true,
    skipped: false,
    version: "accessory_micro_crop_runtime_v1",
    authority_owner: "visioncore",
    target_type: targetType,
    locator,
    plan,
    clipped_detections: clippedDetections,
    segmentation,
    publication_changed: false,
    external_color_authority: false,
    policy: {
      openai_spatial_hint_only: true,
      visioncore_validates_crop: true,
      detector_pass_budget: 1,
      segmentation_pass_budget: 1,
      color_requires_existing_pixel_ownership_gate: true,
    },
  };
}
