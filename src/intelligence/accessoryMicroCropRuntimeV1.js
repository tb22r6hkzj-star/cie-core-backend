import { buildAccessoryMicroCropPlanV1 } from "./accessoryMicroCropV1.js";
import { runOpenAIAccessorySpatialGuidanceV2 } from "./external/openAIAccessorySpatialGuidanceV2.js";

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

function normalizedExclusions(guidance = {}) {
  return (Array.isArray(guidance?.exclusions) ? guidance.exclusions : [])
    .map((row) => ({
      type: row?.type || "other",
      confidence: Number(row?.confidence || 0),
      bbox: normalizeBox(row?.bbox),
    }))
    .filter((row) => row.bbox && row.confidence >= 0.6);
}

export function clipDetectionToMicroCropV1(detection = {}, crop = null, guidance = null) {
  const box = normalizeBox(detection?.bbox || detection?.bounding_box || detection);
  const normalizedCrop = normalizeBox(crop);
  const clipped = intersect(box, normalizedCrop);
  if (!box || !normalizedCrop || !clipped) return null;
  const exclusions = normalizedExclusions(guidance || {});
  return {
    ...detection,
    bbox: { x: clipped.x, y: clipped.y, width: clipped.width, height: clipped.height },
    micro_crop_applied: true,
    micro_crop_source: "openai_spatial_guidance_v2_visioncore_validated",
    accessory_semantic_exclusions_v2: exclusions,
    accessory_material_hypothesis_v2: guidance?.material || "unknown",
    accessory_perceived_color_family_v2: guidance?.perceived_color_family || "unclear",
    accessory_appearance_note_v2: guidance?.appearance_note || "",
    external_color_authority: false,
  };
}

export async function executeAccessoryMicroCropRuntimeV1({
  imageUrl,
  targetType,
  detectorBox = null,
  runLocator = runOpenAIAccessorySpatialGuidanceV2,
  runDetector,
  runSegmenter,
  apiKey = process.env.OPENAI_API_KEY,
  model = process.env.OPENAI_SEMANTIC_MODEL || "gpt-5.6-luna",
} = {}) {
  if (!["watch", "earrings"].includes(targetType)) {
    return { ok: false, skipped: true, reason: "unsupported_target", target_type: targetType || null };
  }
  const guidance = await runLocator({ imageUrl, targetType, apiKey, model });
  const locatorForPlan = {
    ...guidance,
    bbox: guidance?.focus_bbox || guidance?.target_bbox || guidance?.bbox || null,
  };
  const plan = buildAccessoryMicroCropPlanV1({ targetType, locatorResult: locatorForPlan, detectorBox });
  if (!guidance?.found || !plan.execution_allowed) {
    return { ok: true, skipped: true, target_type: targetType, locator: guidance, guidance, plan, reason: plan.reason || guidance?.reason || "micro_crop_not_allowed" };
  }
  if (typeof runDetector !== "function") {
    return { ok: true, skipped: true, target_type: targetType, locator: guidance, guidance, plan, reason: "detector_executor_missing" };
  }
  const detected = await runDetector({ imageUrl, targetType, crop: plan.crop, maxPasses: 1 });
  const rows = Array.isArray(detected?.detections) ? detected.detections : Array.isArray(detected) ? detected : [];
  const clippedDetections = rows.map((row) => clipDetectionToMicroCropV1(row, plan.crop, guidance)).filter(Boolean);
  let segmentation = null;
  if (clippedDetections.length && typeof runSegmenter === "function") {
    segmentation = await runSegmenter({ imageUrl, targetType, crop: plan.crop, detections: clippedDetections, maxPasses: 1, guidance });
  }
  return {
    ok: true,
    skipped: false,
    version: "accessory_micro_crop_runtime_v2",
    authority_owner: "visioncore",
    target_type: targetType,
    locator: guidance,
    guidance,
    plan,
    semantic_exclusions: normalizedExclusions(guidance),
    material_hypothesis: guidance?.material || "unknown",
    perceived_color_family: guidance?.perceived_color_family || "unclear",
    appearance_note: guidance?.appearance_note || "",
    clipped_detections: clippedDetections,
    segmentation,
    publication_changed: false,
    external_color_authority: false,
    policy: {
      openai_semantic_spatial_guidance_only: true,
      openai_exclusions_require_visioncore_operational_application: true,
      visioncore_validates_crop: true,
      detector_pass_budget: 1,
      segmentation_pass_budget: 1,
      color_requires_existing_pixel_ownership_gate: true,
    },
  };
}
