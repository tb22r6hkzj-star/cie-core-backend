import test from "node:test";
import assert from "node:assert/strict";
import { analyzePerceptionV6 } from "../src/intelligence/perceptionV6/index.js";
process.env.NODE_ENV = "test";
const { extractDinoBboxRegionColors } = await import("../src/server.js");

function rgbaImage(width, height, painter) {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r,g,b] = painter(x,y);
      const i = (y * width + x) * 4;
      data[i] = r; data[i+1] = g; data[i+2] = b; data[i+3] = 255;
    }
  }
  return { width, height, data };
}

test("high-contrast bare-head candidate is withheld when positive headwear evidence is insufficient", () => {
  const image = rgbaImage(40, 40, (x,y) => {
    if (x >= 10 && x < 30 && y >= 2 && y < 16) {
      if (y < 12) return [18,18,20];
      return [175,112,82];
    }
    return [210,190,165];
  });
  const region = { id:"hat-fp", zone:"accessory_jewelry", segment_label:"hat", confidence:.88 };
  const perceptionV5 = {
    hypotheses:[{ region_index:0, strategy:"original", score:.88 }],
    normalized_regions:[{ normalized_box:{ x:.25, y:.05, w:.5, h:.35, x2:.75, y2:.40 } }],
    contradictions:[],
    arbitration:{ outcome:"accepted", confidence:.88 },
  };
  const result = analyzePerceptionV6({ perceptionV5, regions:[region], decodedImage:image, mode:"assist" });
  const validation = result.evidence_ledger[0].validation;
  assert.equal(result.evidence_ledger[0].accepted, false);
  assert.equal(validation.reason, "insufficient_positive_headwear_evidence");
  assert.deepEqual(validation.structural_evidence, []);
  assert.equal(result.object_presence.accessory_jewelry.present, false);
});

test("repeated green evidence across lower-garment windows outranks near-black contamination", () => {
  const image = rgbaImage(120, 160, (x,y) => {
    // Within the pants bbox, repeat a forest-green body signal through every center window
    // while leaving a larger near-black share to reproduce the market failure shape.
    if (x >= 24 && x < 96 && y >= 40 && y < 150) {
      return (x % 10 < 3) ? [30,58,39] : [13,19,30];
    }
    return [185,160,135];
  });
  const extraction = extractDinoBboxRegionColors(
    image,
    { x_min:.15, y_min:.20, x_max:.85, y_max:.96 },
    6,
    { zone:"lower_garment", category:"pants", label:"pants" }
  );
  assert.ok(extraction.debug.green_window_support >= 2);
  assert.ok(extraction.colors.length >= 2);
  const top = extraction.colors[0];
  assert.match(String(top.name || "").toLowerCase(), /green|olive|forest|sage/);
});
