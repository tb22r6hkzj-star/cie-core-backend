import test from "node:test";
import assert from "node:assert/strict";
import { analyzePerceptionV5 } from "../src/intelligence/perceptionV5/index.js";
import { analyzePerceptionV6 } from "../src/intelligence/perceptionV6/index.js";

function region(confidence) {
  return {
    id: `confidence-${confidence}`,
    zone: "accessory_jewelry",
    segment_label: "hat",
    confidence,
    coverage: 0.08,
    source_type: "grounding_dino",
    bbox: { x: 0.2, y: 0.05, width: 0.4, height: 0.25 },
    dominant_hex: "#202020",
    region_colors: [{ hex: "#202020", pct: 0.7 }],
  };
}

for (const [input, expected] of [[43, 0.43], [0.43, 0.43], [87, 0.87]]) {
  test(`V5 normalizes detector confidence ${input} to ${expected}`, () => {
    const result = analyzePerceptionV5({ regions: [region(input)] });
    const original = result.hypotheses.find((item) => item.strategy === "original");
    assert.ok(original);
    assert.equal(original.evidence.confidence, expected);
  });
}

test("V5 no longer turns a 43 percent DINO candidate into perfect detector evidence", () => {
  const result = analyzePerceptionV5({ regions: [region(43)] });
  const original = result.hypotheses.find((item) => item.strategy === "original");
  assert.ok(original.score < 1);
  assert.equal(original.evidence.confidence, 0.43);
});

test("V6 raw-region fallback also normalizes 0..100 confidence", () => {
  const raw = region(43);
  const perceptionV5 = {
    hypotheses: [],
    contradictions: [],
    normalized_regions: [{ normalized_box: { x: .2, y: .05, width: .4, height: .25, x2: .6, y2: .3 } }],
    arbitration: { outcome: "review", confidence: 0.43 },
  };
  const result = analyzePerceptionV6({ perceptionV5, regions: [raw], decodedImage: null, mode: "assist" });
  assert.equal(result.evidence_ledger[0].confidence, 0.43);
  assert.equal(result.evidence_ledger[0].validation.reason, "detector_only_no_pixels");
});

test("43 percent headwear confidence cannot masquerade as detector_support in V3", () => {
  const width = 40, height = 40;
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const i = (y * width + x) * 4;
    const inside = x >= 8 && x < 24 && y >= 2 && y < 12;
    const value = inside ? ((x + y) % 4 < 2 ? 24 : 72) : 190;
    data[i] = value; data[i + 1] = value; data[i + 2] = value; data[i + 3] = 255;
  }
  const raw = region(43);
  const perceptionV5 = analyzePerceptionV5({ regions: [raw] });
  const result = analyzePerceptionV6({ perceptionV5, regions: [raw], decodedImage: { width, height, data }, mode: "assist" });
  const validation = result.evidence_ledger[0].validation;
  assert.ok(!validation.diagnostic_evidence.includes("detector_support"));
});
