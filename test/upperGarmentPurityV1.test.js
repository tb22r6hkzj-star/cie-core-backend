import test from "node:test";
import assert from "node:assert/strict";
import chroma from "chroma-js";
import { applyUpperGarmentPurityV1 } from "../src/intelligence/upperGarmentPurityV1.js";

function image(width = 100, height = 100, hex = "#60321E") {
  const data = new Uint8Array(width * height * 4);
  const [r, g, b] = chroma(hex).rgb();
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = 255;
  }
  return { width, height, data };
}

function fillRect(img, x0, y0, x1, y1, hex) {
  const [r, g, b] = chroma(hex).rgb();
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * img.width + x) * 4;
      img.data[i] = r;
      img.data[i + 1] = g;
      img.data[i + 2] = b;
      img.data[i + 3] = 255;
    }
  }
}

function upperRegion(extra = {}) {
  return {
    id: "upper-1",
    zone: "upper_garment",
    source_type: "grounding_dino",
    confidence: 0.92,
    bounding_box: { x: 0, y: 0, width: 1, height: 1 },
    dominant_hex: "#20110B",
    region_colors: [{ hex: "#20110B", pct: 0.56 }],
    ...extra,
  };
}

test("brown shirt body beats dark neckline, underarm gaps, and lower boundary contamination", () => {
  const img = image(100, 100, "#60321E");
  fillRect(img, 0, 0, 100, 16, "#20110B");
  fillRect(img, 0, 30, 20, 75, "#20110B");
  fillRect(img, 80, 30, 100, 75, "#20110B");
  fillRect(img, 0, 86, 100, 100, "#4E604F");

  const result = applyUpperGarmentPurityV1({ decodedImage: img, regions: [upperRegion()] });
  const region = result.regions[0];
  assert.equal(region.color_debug.upper_garment_purity_v1.applied, true);
  assert.equal(region.color_debug.garment_tone_stability_v1.applied, true);
  assert.ok(chroma.distance(region.dominant_hex, "#60321E", "lab") < 18);
  assert.equal(region.region_colors[0].source, "garment_tone_stability_v1");
  assert.equal(region.color_debug.garment_color_constancy_v1.applied, false);
  assert.equal(
    region.color_debug.garment_color_constancy_v1.reason,
    "no_explicitly_owned_measured_colors"
  );
  assert.ok(region.region_colors[0].body_share >= 0.45);
});

test("true black shirt remains black when darkness is distributed across body mass", () => {
  const img = image(100, 100, "#111111");
  fillRect(img, 0, 0, 100, 15, "#262626");
  const result = applyUpperGarmentPurityV1({ decodedImage: img, regions: [upperRegion({ dominant_hex: "#111111" })] });
  assert.ok(chroma.distance(result.regions[0].dominant_hex, "#111111", "lab") < 12);
  assert.ok(result.regions[0].region_colors[0].body_share >= 0.45);
});

test("genuine multicolor upper garment preserves body-distributed secondary color", () => {
  const img = image(100, 100, "#60321E");
  fillRect(img, 50, 18, 89, 84, "#D5C2A8");
  const result = applyUpperGarmentPurityV1({ decodedImage: img, regions: [upperRegion()] });
  const colors = result.regions[0].region_colors.slice(0, 3);
  assert.ok(colors.some((c) => chroma.distance(c.hex, "#60321E", "lab") < 18));
  assert.ok(colors.some((c) => chroma.distance(c.hex, "#D5C2A8", "lab") < 18));
});

test("non-upper regions are not modified", () => {
  const img = image();
  const lower = { ...upperRegion(), zone: "lower_garment", id: "lower-1" };
  const result = applyUpperGarmentPurityV1({ decodedImage: img, regions: [lower] });
  assert.deepEqual(result.regions[0], lower);
});
