import test from "node:test";
import assert from "node:assert/strict";
import { buildSemanticPublicationConstraintsV1 } from "../src/intelligence/external/semanticPublicationPolicyV1.js";

test("suppresses a high-confidence contradiction without direct DINO evidence", () => {
  const result = buildSemanticPublicationConstraintsV1({
    reconciliation: { candidates: [{ piece: "outerwear", action: "contradict", semantic_confidence: 0.99 }] },
    outfitAnalysis: { segmented_regions: [] },
  });
  assert.deepEqual(result.suppressed_pieces, ["outerwear"]);
});

test("does not suppress a contradicted piece backed by direct DINO evidence", () => {
  const result = buildSemanticPublicationConstraintsV1({
    reconciliation: { candidates: [{ piece: "eyewear", action: "contradict", semantic_confidence: 0.99 }] },
    outfitAnalysis: { segmented_regions: [{ source_type: "grounding_dino", label: "glasses" }] },
  });
  assert.deepEqual(result.suppressed_pieces, []);
});

test("confirms only high-confidence semantic support with VisionCore spatial evidence", () => {
  const result = buildSemanticPublicationConstraintsV1({
    reconciliation: { candidates: [
      { piece: "belt", action: "support", semantic_confidence: 0.99, spatial_evidence: { supported: true } },
      { piece: "ring", action: "support", semantic_confidence: 0.89, spatial_evidence: { supported: true } },
    ] },
  });
  assert.deepEqual(result.confirmed_pieces, ["belt"]);
  assert.equal(result.external_color_authority, false);
});

test("suppresses a high-confidence inventory omission without direct DINO evidence", () => {
  const result = buildSemanticPublicationConstraintsV1({
    reconciliation: { candidates: [{
      piece: "fur_trim",
      action: "inventory_omission",
      semantic_confidence: 0.98,
    }] },
    outfitAnalysis: { segmented_regions: [] },
  });
  assert.deepEqual(result.suppressed_pieces, ["fur_trim"]);
});
