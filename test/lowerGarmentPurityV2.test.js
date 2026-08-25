import test from "node:test";
import assert from "node:assert/strict";
import { applyLowerGarmentPurityV2 } from "../src/intelligence/lowerGarmentPurityV2.js";

function image(width, height, painter) {
  const data = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = painter(x, y, width, height);
      const i = (y * width + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
  return { width, height, data };
}

function lowerRegion(extra = {}) {
  return {
    id: "pants-1",
    zone: "lower_garment",
    source_type: "grounding_dino",
    bbox: { x: 0, y: 0, width: 1, height: 1 },
    dominant_hex: "#0D131E",
    region_colors: [{ hex: "#0D131E", pct: 0.67 }],
    ...extra,
  };
}

const GREEN = [78, 96, 79];
const BLACK = [13, 19, 30];
const BROWN = [96, 50, 30];

test("green lower garment survives black belt, shoe bands, and central dark separator", () => {
  const decodedImage = image(120, 160, (x, y, w, h) => {
    const rx = x / w;
    const ry = y / h;
    if (ry < 0.14) return BLACK;
    if (ry > 0.86) return BLACK;
    if (rx > 0.46 && rx < 0.54 && ry > 0.28) return BLACK;
    return GREEN;
  });

  const result = applyLowerGarmentPurityV2({ decodedImage, regions: [lowerRegion()] });
  const zone = result.regions[0];
  assert.equal(zone.color_debug.lower_garment_purity_v2.applied, true);
  assert.notEqual(zone.dominant_hex, "#0D131E");
  assert.ok(zone.region_colors.length > 0);
  assert.ok(zone.region_colors[0].body_share >= 0.5);
  assert.ok(zone.color_debug.lower_garment_purity_v2.center_separator_weight > 0);
  assert.ok(zone.color_debug.garment_color_constancy_v1);
  assert.equal(result.summary.color_constancy_v1.handoff, "post_lower_purity_pre_upper_purity");
});

test("true black pants remain black when darkness is distributed across the garment body", () => {
  const decodedImage = image(100, 140, () => BLACK);
  const result = applyLowerGarmentPurityV2({ decodedImage, regions: [lowerRegion()] });
  const zone = result.regions[0];
  assert.ok(zone.dominant_hex);
  assert.ok(zone.region_colors[0].body_share >= 0.5);
  const [r, g, b] = [zone.dominant_hex.slice(1, 3), zone.dominant_hex.slice(3, 5), zone.dominant_hex.slice(5, 7)].map((x) => parseInt(x, 16));
  assert.ok(r < 35 && g < 35 && b < 45);
});

test("brown pants are not overtaken by a dark footwear band", () => {
  const decodedImage = image(100, 140, (_x, y, _w, h) => (y / h > 0.82 ? BLACK : BROWN));
  const result = applyLowerGarmentPurityV2({ decodedImage, regions: [lowerRegion()] });
  const zone = result.regions[0];
  const labBrown = zone.region_colors.find((c) => c.body_share > 0.5);
  assert.ok(labBrown);
  assert.equal(zone.region_colors[0].hex, labBrown.hex);
});

test("non-lower garment regions are unchanged", () => {
  const upper = {
    id: "shirt-1",
    zone: "upper_garment",
    source_type: "grounding_dino",
    bbox: { x: 0, y: 0, width: 1, height: 1 },
    dominant_hex: "#60321E",
    region_colors: [{ hex: "#60321E", pct: 0.8 }],
  };
  const result = applyLowerGarmentPurityV2({ decodedImage: image(20, 20, () => BROWN), regions: [upper] });
  assert.equal(result.regions[0], upper);
  assert.equal(result.summary.corrected_region_count, 0);
});