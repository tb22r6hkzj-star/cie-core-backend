import test from "node:test";
import assert from "node:assert/strict";
import { analyzeRegionColorEvidence } from "../src/intelligence/colorEvidence/index.js";

function makeImage({ split = false } = {}) {
  const width = 100;
  const height = 140;
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let rgb = [220, 210, 195];
      if (x >= 20 && x < 80 && y >= 20 && y < 125) {
        const boundary = x < 25 || x >= 75 || y < 25 || y >= 120;
        if (boundary) rgb = [18, 20, 18];
        else if (split && x >= 50) rgb = [32, 40, 58];
        else rgb = [78, 96, 79];
      }
      const i = (y * width + x) * 4;
      data[i] = rgb[0]; data[i + 1] = rgb[1]; data[i + 2] = rgb[2]; data[i + 3] = 255;
    }
  }
  return { width, height, data };
}

test("interior consensus identifies green garment despite dark boundary contamination", () => {
  const result = analyzeRegionColorEvidence({
    decodedImage: makeImage(),
    bbox: { x: 0.2, y: 0.14, width: 0.6, height: 0.76 },
    expectedHex: "#4E604F",
  });
  assert.equal(result.available, true);
  assert.equal(result.consensus_family, "green");
  assert.ok(result.family_consensus >= 0.8);
  assert.ok(result.region_purity >= 0.8);
  assert.equal(result.decision_state, "supported");
});

test("mixed conflicting garment windows lower purity instead of forcing a color", () => {
  const result = analyzeRegionColorEvidence({
    decodedImage: makeImage({ split: true }),
    bbox: { x: 0.2, y: 0.14, width: 0.6, height: 0.76 },
    expectedHex: "#4E604F",
  });
  assert.equal(result.available, true);
  assert.ok(result.family_consensus < 1);
  assert.ok(result.region_purity < 0.8);
  assert.notEqual(result.decision_state, "supported");
});
