import assert from "node:assert/strict";
import test from "node:test";
import { measureDinoInteriorPixelsV1 } from "../src/intelligence/dinoInteriorMeasurementV1.js";

function makeImage(width, height, borderHex, interiorHex, border = 2) {
  const data = new Uint8Array(width * height * 4);
  const parse = (hex) => [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
  const borderRgb = parse(borderHex);
  const interiorRgb = parse(interiorHex);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const isBorder = x < border || y < border || x >= width - border || y >= height - border;
      const [r, g, b] = isBorder ? borderRgb : interiorRgb;
      const idx = (y * width + x) * 4;
      data[idx] = r;
      data[idx + 1] = g;
      data[idx + 2] = b;
      data[idx + 3] = 255;
    }
  }
  return { width, height, data };
}

test("interior measurement rejects wrong bbox border color", () => {
  const decodedImage = makeImage(20, 20, "#C9A778", "#3F5041", 3);
  const result = measureDinoInteriorPixelsV1({
    decodedImage,
    bbox: { x: 0, y: 0, width: 1, height: 1 },
    insetRatio: 0.18,
  });

  assert.equal(result.available, true);
  assert.equal(result.colors[0]?.hex, "#3F5041");
  assert.equal(result.colors[0]?.source, "dino_bbox_interior");
  assert.equal(result.policy.boundary_pixels_are_not_first_class_votes, true);
});

test("owned overlap exclusions cannot vote in the measured palette", () => {
  const decodedImage = makeImage(20, 20, "#3F5041", "#3F5041", 0);
  // Paint a red accessory block inside the garment box.
  for (let y = 7; y < 13; y += 1) {
    for (let x = 7; x < 13; x += 1) {
      const idx = (y * 20 + x) * 4;
      dataSet(decodedImage.data, idx, 0xA8, 0x2C, 0x34);
    }
  }

  const result = measureDinoInteriorPixelsV1({
    decodedImage,
    bbox: { x: 0, y: 0, width: 1, height: 1 },
    exclusions: [{ x: 7 / 20, y: 7 / 20, width: 6 / 20, height: 6 / 20 }],
    insetRatio: 0.08,
  });

  assert.equal(result.colors[0]?.hex, "#3F5041");
  assert.ok(!result.colors.some((c) => c.hex === "#A82C34"));
  assert.ok(result.excluded_sample_count > 0);
});

function dataSet(data, idx, r, g, b) {
  data[idx] = r;
  data[idx + 1] = g;
  data[idx + 2] = b;
  data[idx + 3] = 255;
}
