import test from "node:test";
import assert from "node:assert/strict";
import { buildAccessoryMicroCropPlanV1, validateAccessoryMicroCropV1 } from "../src/intelligence/accessoryMicroCropV1.js";
import { buildAccessoryMicroLocatorRequestV1 } from "../src/intelligence/external/openAIAccessoryMicroLocatorV1.js";

test("watch-only micro crop accepts a tight high-confidence locator box", () => {
  const result = validateAccessoryMicroCropV1({
    targetType: "watch",
    locatorConfidence: 0.94,
    locatorBox: { x: 0.70, y: 0.47, width: 0.075, height: 0.075 },
    detectorBox: { x: 0.66, y: 0.43, width: 0.15, height: 0.15 },
  });
  assert.equal(result.accepted, true);
  assert.ok(result.crop.width < 0.1);
  assert.equal(result.policy.openai_color_authority, false);
});

test("broad wrist box is rejected for a watch", () => {
  const result = validateAccessoryMicroCropV1({
    targetType: "watch",
    locatorConfidence: 0.96,
    locatorBox: { x: 0.60, y: 0.38, width: 0.30, height: 0.30 },
  });
  assert.equal(result.accepted, false);
  assert.equal(result.reason, "locator_box_too_broad");
});

test("earring micro crop requires spatial agreement with VisionCore detector", () => {
  const result = validateAccessoryMicroCropV1({
    targetType: "earrings",
    locatorConfidence: 0.9,
    locatorBox: { x: 0.42, y: 0.10, width: 0.025, height: 0.025 },
    detectorBox: { x: 0.75, y: 0.70, width: 0.03, height: 0.03 },
  });
  assert.equal(result.accepted, false);
  assert.equal(result.reason, "locator_detector_spatial_disagreement");
});

test("micro crop plan never grants OpenAI publication or color authority", () => {
  const plan = buildAccessoryMicroCropPlanV1({
    targetType: "watch",
    locatorResult: { confidence: 0.93, bbox: { x: 0.69, y: 0.45, width: 0.08, height: 0.08 } },
  });
  assert.equal(plan.execution_allowed, true);
  assert.equal(plan.external_color_authority, false);
  assert.equal(plan.validation.policy.visioncore_remeasurement_required, true);
});

test("OpenAI locator prompt explicitly excludes wrist and forbids numeric color authority", () => {
  const request = buildAccessoryMicroLocatorRequestV1({ imageUrl: "https://example.test/outfit.jpg", targetType: "watch" });
  const text = request.input[0].content[0].text;
  assert.match(text, /watch case\/body and visible band only/i);
  assert.match(text, /Exclude wrist/i);
  assert.match(text, /Do not provide or infer HEX, RGB, LAB/i);
});
