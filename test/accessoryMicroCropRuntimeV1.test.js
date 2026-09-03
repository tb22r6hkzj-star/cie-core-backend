import test from "node:test";
import assert from "node:assert/strict";
import { clipDetectionToMicroCropV1, executeAccessoryMicroCropRuntimeV1 } from "../src/intelligence/accessoryMicroCropRuntimeV1.js";

test("clips a broad watch detection to the validated watch-only micro crop", () => {
  const clipped = clipDetectionToMicroCropV1(
    { label: "watch", bbox: { x: 0.55, y: 0.48, width: 0.20, height: 0.18 } },
    { x: 0.61, y: 0.53, width: 0.08, height: 0.07 }
  );
  assert.deepEqual(clipped.bbox, { x: 0.61, y: 0.53, width: 0.08, height: 0.07 });
  assert.equal(clipped.micro_crop_applied, true);
});

test("runtime uses OpenAI only as a spatial locator then sends clipped detections to VisionCore segmentation", async () => {
  let detectorPayload = null;
  let segmenterPayload = null;
  const result = await executeAccessoryMicroCropRuntimeV1({
    imageUrl: "https://example.test/outfit.jpg",
    targetType: "watch",
    detectorBox: { x: 0.55, y: 0.48, width: 0.20, height: 0.18 },
    runLocator: async () => ({ ok: true, found: true, target_type: "watch", confidence: 0.94, bbox: { x: 0.61, y: 0.53, width: 0.08, height: 0.07 } }),
    runDetector: async (payload) => {
      detectorPayload = payload;
      return { detections: [{ label: "watch", confidence: 0.9, bbox: { x: 0.58, y: 0.50, width: 0.14, height: 0.12 } }] };
    },
    runSegmenter: async (payload) => {
      segmenterPayload = payload;
      return { ok: true, masks: [{ id: "watch-mask" }] };
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.skipped, false);
  assert.equal(result.clipped_detections.length, 1);
  assert.ok(detectorPayload.crop.width < 0.1);
  assert.equal(segmenterPayload.detections[0].micro_crop_applied, true);
  assert.equal(result.external_color_authority, false);
  assert.equal(result.policy.color_requires_existing_pixel_ownership_gate, true);
});

test("broad wrist localization is rejected before detector execution", async () => {
  let detectorCalled = false;
  const result = await executeAccessoryMicroCropRuntimeV1({
    imageUrl: "https://example.test/outfit.jpg",
    targetType: "watch",
    runLocator: async () => ({ ok: true, found: true, confidence: 0.96, bbox: { x: 0.42, y: 0.40, width: 0.35, height: 0.25 } }),
    runDetector: async () => { detectorCalled = true; return { detections: [] }; },
  });
  assert.equal(result.skipped, true);
  assert.equal(detectorCalled, false);
  assert.equal(result.plan.reason, "locator_box_too_broad");
});

test("low-confidence earring localization fails open without publishing color", async () => {
  const result = await executeAccessoryMicroCropRuntimeV1({
    imageUrl: "https://example.test/outfit.jpg",
    targetType: "earrings",
    runLocator: async () => ({ ok: true, found: false, confidence: 0.55, bbox: null, reason: "micro_localization_not_confident" }),
    runDetector: async () => ({ detections: [] }),
  });
  assert.equal(result.skipped, true);
  assert.equal(result.publication_changed, undefined);
});
