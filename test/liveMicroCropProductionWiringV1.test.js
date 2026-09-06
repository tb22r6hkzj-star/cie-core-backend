import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("transform route wires a physical original-image accessory crop into targeted reanalysis", () => {
  const source = fs.readFileSync(new URL("../src/server.js", import.meta.url), "utf8");
  assert.match(source, /executeAccessoryMicroCropRuntimeV1/);
  assert.match(source, /accessoryMicroCropTarget = plannedMicroCropTypes\.includes\("watch"\)/);
  assert.match(source, /createAccessoryMicroCropImageUrlV1\(/);
  assert.match(source, /cropDecodedImageToPngV1\(decodedOriginal, crop\)/);
  assert.match(source, /runGroundingDinoDetection\(cropArtifact\.url, microQuery\)/);
  assert.match(source, /remapCropDetectionToFullImageV1\(detection, cropArtifact\.crop\)/);
  assert.match(source, /detector_input: "physical_original_image_crop"/);
  assert.doesNotMatch(source, /runDetector: async \(\) => runGroundingDinoDetection\(ghostUrl, microQuery\)/);
  assert.match(source, /targetedAcceptedDetections = \[/);
  assert.match(source, /accessory_micro_crop_runtime_v1: accessoryMicroCropRuntime/);
  assert.match(source, /accessory_micro_crop_applied:/);
});

test("failed watch or earring refinement preserves an already accepted full-image identity", () => {
  const source = fs.readFileSync(new URL("../src/server.js", import.meta.url), "utf8");
  assert.match(source, /else if \(accessoryMicroCropRuntime\?\.locator\?\.skipped !== true\)/);
  assert.match(source, /identity_fallback_preserved:/);
  assert.match(source, /targetedAcceptedDetections\.some\(\(detection\) =>/);
});
