import test from "node:test";
import assert from "node:assert/strict";
import { parseYoloWorldOutputV1, yoloClassNamesFromQueryV1 } from "../src/intelligence/yoloWorldFallbackV1.js";

test("converts the VisionCore query into deduplicated YOLO class names", () => {
  assert.equal(yoloClassNamesFromQueryV1("shirt. pants. watch. shirt."), "shirt, pants, watch");
});

test("parses YOLO JSON and normalizes pixel boxes", () => {
  const detections = parseYoloWorldOutputV1({ json_str: JSON.stringify({
    "Det-0": { x0: 100, y0: 50, x1: 300, y1: 250, score: 0.82, cls: "pants" },
    "Det-1": { x0: 10, y0: 10, x1: 30, y1: 30, score: 0.66, cls: "watch" },
  }) }, { imageWidth: 400, imageHeight: 500 });
  assert.equal(detections.length, 2);
  assert.deepEqual(detections[0].bbox, { x_min: 0.25, y_min: 0.1, x_max: 0.75, y_max: 0.5, width: 0.5, height: 0.4 });
  assert.equal(detections[0].source_type, "dino_detection");
  assert.equal(detections[0].detector_provider, "yolo_world_xl");
});

test("invalid JSON and dimensions abstain", () => {
  assert.deepEqual(parseYoloWorldOutputV1({ json_str: "not-json" }, { imageWidth: 10, imageHeight: 10 }), []);
  assert.deepEqual(parseYoloWorldOutputV1({ json_str: "{}" }, { imageWidth: 0, imageHeight: 10 }), []);
});
