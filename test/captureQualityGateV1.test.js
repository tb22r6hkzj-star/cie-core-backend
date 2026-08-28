import test from "node:test";
import assert from "node:assert/strict";
import { evaluateCaptureQualityV1 } from "../src/intelligence/captureQualityGateV1.js";

function image(width, height, pixel) {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const [r, g, b] = pixel(x, y);
      data[offset] = r;
      data[offset + 1] = g;
      data[offset + 2] = b;
      data[offset + 3] = 255;
    }
  }
  return { width, height, data };
}

test("invalid decoded input is blocked instead of receiving a guessed quality score", () => {
  const result = evaluateCaptureQualityV1();
  assert.equal(result.available, false);
  assert.equal(result.disposition, "retake");
  assert.equal(result.publication_recommendation, "withhold_intrinsic_color");
});

test("adequate exposed image passes the capture gate", () => {
  const decodedImage = image(640, 480, (x, y) => ((x + y) % 40 < 20 ? [70, 100, 135] : [145, 175, 205]));
  const result = evaluateCaptureQualityV1({ decodedImage, regions: [{ zone: "upper_garment" }] });
  assert.equal(result.available, true);
  assert.notEqual(result.disposition, "retake");
  assert.equal(result.issues.some((entry) => entry.severity === "blocking"), false);
});

test("clipped photograph is told to retake", () => {
  const decodedImage = image(640, 480, () => [255, 255, 255]);
  const result = evaluateCaptureQualityV1({ decodedImage, regions: [{ zone: "upper_garment" }] });
  assert.equal(result.disposition, "retake");
  assert.ok(result.issues.some((entry) => entry.code === "severe_highlight_clipping"));
});

test("low resolution and declared filters are blocking evidence defects", () => {
  const decodedImage = image(120, 120, () => [90, 100, 110]);
  const result = evaluateCaptureQualityV1({ decodedImage, metadata: { edited_or_filtered: true } });
  assert.equal(result.disposition, "retake");
  assert.ok(result.issues.some((entry) => entry.code === "insufficient_resolution"));
  assert.ok(result.issues.some((entry) => entry.code === "declared_filter_or_edit"));
});

test("global channel cast is a warning rather than proof of incorrect color", () => {
  const decodedImage = image(640, 480, (x) => x % 20 < 10 ? [210, 70, 45] : [125, 35, 20]);
  const result = evaluateCaptureQualityV1({ decodedImage, regions: [{ zone: "upper_garment" }] });
  assert.ok(result.issues.some((entry) => entry.code === "possible_global_color_cast"));
  assert.equal(result.policy.global_color_cast_is_warning_not_proof, true);
});
