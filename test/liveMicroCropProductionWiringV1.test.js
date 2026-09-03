import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("transform route wires accessory micro crop runtime into targeted reanalysis", () => {
  const source = fs.readFileSync(new URL("../src/server.js", import.meta.url), "utf8");
  assert.match(source, /executeAccessoryMicroCropRuntimeV1/);
  assert.match(source, /accessoryMicroCropTarget = plannedMicroCropTypes\.includes\("watch"\)/);
  assert.match(source, /runDetector: async \(\) => runGroundingDinoDetection\(ghostUrl, microQuery\)/);
  assert.match(source, /targetedAcceptedDetections = \[/);
  assert.match(source, /accessory_micro_crop_runtime_v1: accessoryMicroCropRuntime/);
  assert.match(source, /accessory_micro_crop_applied:/);
});

test("unrefined watch or earring retry is suppressed when the micro locator cannot validate it", () => {
  const source = fs.readFileSync(new URL("../src/server.js", import.meta.url), "utf8");
  assert.match(source, /else if \(accessoryMicroCropRuntime\?\.locator\?\.skipped !== true\)/);
  assert.match(source, /!microCropLabelMatches\(detection, accessoryMicroCropTarget\)/);
});
