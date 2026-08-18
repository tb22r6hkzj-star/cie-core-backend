import test from "node:test";
import assert from "node:assert/strict";
import { evaluateSceneBoundaryPurityV1 } from "../src/intelligence/sceneBoundaryPurityV1.js";
import { analyzeRegionColorEvidence } from "../src/intelligence/colorEvidence/index.js";

function rgb(hex) {
  const value = hex.replace("#", "");
  return [0, 2, 4].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16));
}

function spatialGarmentImage(width = 100, height = 100) {
  const data = new Uint8Array(width * height * 4);
  const black = rgb("#0D131E");
  const stone = rgb("#B99A78");
  const green = rgb("#4E604F");
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let color = x < width / 2 ? black : stone;
      if (x >= 28 && x <= 72 && y >= 10 && y <= 90) color = green;
      const i = (y * width + x) * 4;
      data[i] = color[0];
      data[i + 1] = color[1];
      data[i + 2] = color[2];
      data[i + 3] = 255;
    }
  }
  return { width, height, data };
}

test("green garment interior remains garment authority while black boundary becomes scene context", () => {
  const result = evaluateSceneBoundaryPurityV1({
    garmentHex: "#4E604F",
    interiorSamples: [
      { id: "center", hex: "#4E604F", family: "green" },
      { id: "upper", hex: "#526554", family: "green" },
      { id: "lower", hex: "#455947", family: "green" },
    ],
    boundarySamples: [
      { id: "left_edge", hex: "#0D131E", family: "black" },
      { id: "right_edge", hex: "#20110B", family: "black" },
    ],
  });

  assert.equal(result.available, true);
  assert.equal(result.interior_hex, "#4E604F");
  assert.equal(result.policy.garment_authority_source, "interior_evidence");
  assert.equal(result.policy.boundary_role, "context_only");
  assert.ok(result.boundary_context_likelihood > 0.5);
  assert.ok(result.scene_context_candidates.some((c) => c.hex === "#0D131E"));
});

test("coherent green interior stays high-purity when the current garment hypothesis is stale black", () => {
  const result = evaluateSceneBoundaryPurityV1({
    garmentHex: "#0D131E",
    interiorSamples: [
      { id: "center", hex: "#4E604F", family: "green" },
      { id: "upper", hex: "#526554", family: "green" },
      { id: "lower", hex: "#455947", family: "green" },
    ],
    boundarySamples: [],
  });

  assert.equal(result.available, true);
  assert.ok(result.garment_agreement < 0.5);
  assert.ok(result.region_purity >= 0.78);
  assert.equal(result.decision_state, "clean");
  assert.equal(result.policy.current_garment_hypothesis_role, "diagnostic_only");
});

test("warm stone boundary is retained as context without changing rich-brown garment authority", () => {
  const result = evaluateSceneBoundaryPurityV1({
    garmentHex: "#60321E",
    interiorSamples: [
      { id: "center", hex: "#60321E", family: "brown" },
      { id: "upper", hex: "#6B3924", family: "brown" },
    ],
    boundarySamples: [
      { id: "edge", hex: "#B99A78", family: "brown" },
      { id: "edge2", hex: "#C7AB87", family: "brown" },
    ],
  });

  assert.equal(result.interior_hex, "#60321E");
  assert.ok(result.scene_context_candidates.length >= 1);
  assert.equal(result.policy.boundary_role, "context_only");
});

test("boundary close to garment color is treated as garment overlap, not scene context", () => {
  const result = evaluateSceneBoundaryPurityV1({
    garmentHex: "#4E604F",
    interiorSamples: [{ id: "center", hex: "#4E604F", family: "green" }],
    boundarySamples: [{ id: "edge", hex: "#526154", family: "green" }],
  });

  assert.equal(result.scene_context_candidates.length, 0);
  assert.ok(result.boundary_garment_overlap > 0.5);
  assert.ok(result.boundary_context_likelihood < 0.5);
});

test("spatial regression: dark and stone bbox edges stay context-only while green interior controls garment consensus", () => {
  const evidence = analyzeRegionColorEvidence({
    decodedImage: spatialGarmentImage(),
    bbox: { x: 0, y: 0, width: 1, height: 1 },
    expectedHex: "#4E604F",
  });

  assert.equal(evidence.available, true);
  assert.equal(evidence.consensus_family, "green");
  assert.ok(evidence.windows.every((window) => window.family === "green"));
  assert.ok(evidence.boundary_windows.length >= 4);
  assert.ok(evidence.scene_context_candidates.length >= 1);
  assert.equal(evidence.scene_boundary_purity.policy.garment_authority_source, "interior_evidence");
  assert.equal(evidence.scene_boundary_purity.policy.boundary_role, "context_only");
});

test("missing interior evidence withholds a garment purity decision", () => {
  const result = evaluateSceneBoundaryPurityV1({
    boundarySamples: [{ id: "edge", hex: "#B99A78", family: "brown" }],
  });

  assert.equal(result.available, false);
  assert.equal(result.reason, "missing_interior_evidence");
});
