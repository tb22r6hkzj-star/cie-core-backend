import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("live transform lets accessory color challenges force micro-crop even when identity already exists", () => {
  const source = fs.readFileSync(new URL("../src/server.js", import.meta.url), "utf8");
  assert.match(source, /buildAccessoryIntelligenceLaneV1/);
  assert.match(source, /forced_micro_crop_targets/);
  assert.match(source, /forced_by_accessory_intelligence_lane/);
  assert.match(source, /accessory_color_challenge_requires_remeasurement/);
  assert.match(source, /accessory_intelligence_lane:/);
  assert.match(source, /executeAccessoryMicroCropRuntimeV1/);
});
