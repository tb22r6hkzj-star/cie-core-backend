import test from "node:test";
import assert from "node:assert/strict";
import { evaluateSceneBoundaryPurityV1 } from "../src/intelligence/sceneBoundaryPurityV1.js";

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
  assert.ok(result.scene_context_candidates.some((c) => c.hex === "#0D131E"));
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

test("boundary close to garment color is not falsely promoted to scene context", () => {
  const result = evaluateSceneBoundaryPurityV1({
    garmentHex: "#4E604F",
    interiorSamples: [{ id: "center", hex: "#4E604F", family: "green" }],
    boundarySamples: [{ id: "edge", hex: "#526154", family: "green" }],
  });

  assert.equal(result.scene_context_candidates.length, 0);
  assert.ok(result.boundary_contamination_risk > 0.5);
});

test("missing interior evidence withholds a garment purity decision", () => {
  const result = evaluateSceneBoundaryPurityV1({
    boundarySamples: [{ id: "edge", hex: "#B99A78", family: "brown" }],
  });

  assert.equal(result.available, false);
  assert.equal(result.reason, "missing_interior_evidence");
});
