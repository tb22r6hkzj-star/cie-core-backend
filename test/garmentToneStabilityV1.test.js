import test from "node:test";
import assert from "node:assert/strict";
import chroma from "chroma-js";
import { analyzeGarmentToneStabilityV1, applyGarmentToneStabilityV1 } from "../src/intelligence/garmentToneStabilityV1.js";

const SPECS = {
  upper_left: { x: 0.28, y: 0.27, w: 0.18, h: 0.22 },
  upper_center: { x: 0.41, y: 0.25, w: 0.18, h: 0.24 },
  upper_right: { x: 0.54, y: 0.27, w: 0.18, h: 0.22 },
  lower_left: { x: 0.29, y: 0.52, w: 0.18, h: 0.22 },
  lower_center: { x: 0.41, y: 0.50, w: 0.18, h: 0.24 },
  lower_right: { x: 0.53, y: 0.52, w: 0.18, h: 0.22 },
};

function rgb(hex) {
  return chroma(hex).rgb().map((v) => Math.round(v));
}

function image(width = 120, height = 120, fill = "#60321E") {
  const data = Buffer.alloc(width * height * 4);
  const [r, g, b] = rgb(fill);
  for (let i = 0; i < width * height; i += 1) {
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = 255;
  }
  return { width, height, data };
}

function paintWindow(img, spec, hex) {
  const [r, g, b] = rgb(hex);
  const x0 = Math.floor(spec.x * img.width);
  const y0 = Math.floor(spec.y * img.height);
  const x1 = Math.ceil((spec.x + spec.w) * img.width);
  const y1 = Math.ceil((spec.y + spec.h) * img.height);
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const i = (y * img.width + x) * 4;
      img.data[i] = r;
      img.data[i + 1] = g;
      img.data[i + 2] = b;
      img.data[i + 3] = 255;
    }
  }
}

const fullBox = { x: 0, y: 0, width: 1, height: 1 };

test("uses majority interior midtone instead of isolated highlight and shadow", () => {
  const img = image(120, 120, "#60321E");
  paintWindow(img, SPECS.upper_center, "#B86F4B");
  paintWindow(img, SPECS.lower_right, "#24120D");

  const result = analyzeGarmentToneStabilityV1({ decodedImage: img, bbox: fullBox });
  assert.equal(result.available, true);
  assert.equal(result.stable, true);
  assert.ok(result.consensus_ratio >= 0.6);
  assert.ok(chroma.distance(result.stable_hex, "#60321E", "lab") < 8);
  assert.ok(chroma.distance(result.stable_hex, "#B86F4B", "lab") > 8);
});

test("preserves a genuinely light garment when interior patches agree", () => {
  const img = image(120, 120, "#D6B18A");
  const result = analyzeGarmentToneStabilityV1({ decodedImage: img, bbox: fullBox });
  assert.equal(result.stable, true);
  assert.ok(chroma.distance(result.stable_hex, "#D6B18A", "lab") < 5);
});

test("preserves a genuinely dark garment when interior patches agree", () => {
  const img = image(120, 120, "#151515");
  const result = analyzeGarmentToneStabilityV1({ decodedImage: img, bbox: fullBox });
  assert.equal(result.stable, true);
  assert.ok(chroma.distance(result.stable_hex, "#151515", "lab") < 5);
});

test("does not force a tone when interior garment is genuinely split", () => {
  const img = image(120, 120, "#60321E");
  for (const key of ["upper_right", "lower_center", "lower_right"]) {
    paintWindow(img, SPECS[key], "#3F5041");
  }
  const result = analyzeGarmentToneStabilityV1({ decodedImage: img, bbox: fullBox });
  assert.equal(result.available, true);
  assert.equal(result.stable, false);
  assert.equal(result.reason, "interior_tone_disagreement");
});

test("updates upper DINO dominant only when stable interior consensus exists", () => {
  const img = image(120, 120, "#60321E");
  paintWindow(img, SPECS.upper_center, "#B86F4B");
  const regions = [{
    id: "upper-1",
    zone: "upper_garment",
    source_type: "grounding_dino",
    bounding_box: fullBox,
    dominant_hex: "#A45E3E",
    region_colors: [
      { hex: "#A45E3E", pct: 0.84, source: "upper_garment_purity_v1" },
      { hex: "#20110B", pct: 0.11, source: "upper_garment_purity_v1" },
    ],
  }];
  const result = applyGarmentToneStabilityV1({ decodedImage: img, regions });
  assert.equal(result.summary.corrected_region_count, 1);
  assert.ok(chroma.distance(result.regions[0].dominant_hex, "#60321E", "lab") < 8);
  assert.equal(result.regions[0].region_colors[0].source, "garment_tone_stability_v1");
  assert.ok(result.regions[0].color_debug.garment_tone_stability_v1.consensus_ratio >= 0.6);
});

test("does not modify non-upper zones", () => {
  const img = image();
  const lower = { zone: "lower_garment", source_type: "grounding_dino", bounding_box: fullBox, dominant_hex: "#3F5041" };
  const result = applyGarmentToneStabilityV1({ decodedImage: img, regions: [lower] });
  assert.deepEqual(result.regions[0], lower);
});
