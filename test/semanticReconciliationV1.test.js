import test from "node:test";
import assert from "node:assert/strict";
import { normalizeSemanticPieceV1, reconcileExternalSemanticsV1 } from "../src/intelligence/external/semanticReconciliationV1.js";

const outfitAnalysis = {
  garment_analysis: {
    detected_items: [
      { type: "upper_garment", confidence: 83, dominant_color: { hex: "#935234" } },
      { type: "eyewear", confidence: 45, dominant_color: { hex: "#3F5041" } },
    ],
  },
  garment_zones: { zones: { lower_garment: { confidence: 92, primary_color: { hex: "#3F5041" } } } },
  segmented_regions: [{ zone: "footwear", label: "loafers", score: 0.87 }],
};

function reconcile(claims) {
  return reconcileExternalSemanticsV1({
    handoff: { mode: "shadow", semantic_observation: { claims } },
    outfitAnalysis,
  });
}

test("normalizes common garment and accessory names", () => {
  assert.equal(normalizeSemanticPieceV1("trousers"), "lower_garment");
  assert.equal(normalizeSemanticPieceV1("loafers"), "footwear");
  assert.equal(normalizeSemanticPieceV1("necklace"), "necklace");
  assert.equal(normalizeSemanticPieceV1("short sleeve collared button front shirt"), "upper_garment");
  assert.equal(normalizeSemanticPieceV1("straight-leg trousers"), "lower_garment");
  assert.equal(normalizeSemanticPieceV1("loafer-style footwear"), "footwear");
  assert.equal(normalizeSemanticPieceV1("layered necklaces"), "necklace");
  assert.equal(normalizeSemanticPieceV1("gold watch"), "watch");
  assert.equal(normalizeSemanticPieceV1("ear studs"), "earrings");
  assert.equal(normalizeSemanticPieceV1("finger ring"), "ring");
});

test("semantic-only belt remains unpublished pending spatial confirmation", () => {
  const result = reconcile([{ action: "support", piece: "belt", zone: "waist", confidence: 0.96 }]);
  assert.equal(result.candidates[0].status, "semantic_only_requires_spatial_confirmation");
  assert.equal(result.publication_changed, false);
  assert.equal(result.color_changed, false);
});

test("SAM or DINO spatial support produces a corroborated shadow candidate", () => {
  const result = reconcile([{ action: "support", piece: "loafers", zone: "feet", confidence: 0.94 }]);
  assert.equal(result.candidates[0].piece, "footwear");
  assert.equal(result.candidates[0].spatial_evidence.source, "segmented_region");
  assert.equal(result.candidates[0].status, "corroborated_shadow_candidate");
});

test("belt support requires a validated DINO plus SAM localization record", () => {
  const withBelt = structuredClone(outfitAnalysis);
  withBelt.belt_localization_v1 = {
    candidates: [{ object_type: "belt", confidence: 82, validated: true }],
  };
  const result = reconcileExternalSemanticsV1({
    handoff: { mode: "shadow", semantic_observation: { claims: [{ action: "support", piece: "belt", confidence: 0.96 }] } },
    outfitAnalysis: withBelt,
  });
  assert.equal(result.candidates[0].status, "corroborated_shadow_candidate");
  assert.equal(result.candidates[0].spatial_evidence.source, "dino_sam_belt_localization_v1");
  assert.equal(result.publication_changed, false);
  assert.equal(result.color_changed, false);
});

test("a hat region cannot corroborate a watch or necklace claim", () => {
  const result = reconcile([
    { action: "support", piece: "watch", confidence: 0.97 },
    { action: "support", piece: "necklace", confidence: 0.99 },
  ]);
  assert.equal(result.candidates[0].status, "semantic_only_requires_spatial_confirmation");
  assert.equal(result.candidates[1].status, "semantic_only_requires_spatial_confirmation");
});

test("external contradiction flags false eyewear without mutating published analysis", () => {
  const before = structuredClone(outfitAnalysis);
  const result = reconcile([{ action: "contradict", piece: "eyewear", zone: "face", confidence: 0.99 }]);
  assert.equal(result.candidates[0].status, "conflict_review_candidate");
  assert.deepEqual(outfitAnalysis, before);
  assert.equal(outfitAnalysis.garment_analysis.detected_items[0].dominant_color.hex, "#935234");
});

test("comprehensive semantic inventory omission flags possible false eyewear without suppressing it", () => {
  const result = reconcile([{ action: "support", piece: "short sleeve shirt", zone: "upper body", confidence: 0.99 }]);
  const eyewear = result.candidates.find((candidate) => candidate.piece === "eyewear");
  assert.equal(eyewear.status, "semantic_inventory_omission_review");
  assert.equal(result.publication_changed, false);
  assert.ok(outfitAnalysis.garment_analysis.detected_items.some((item) => item.type === "eyewear"));
});

test("lower garment support cannot replace VisionCore color evidence", () => {
  const result = reconcile([{ action: "support", piece: "pants", zone: "lower_body", confidence: 0.98, hex: "#FFFFFF" }]);
  assert.equal(result.candidates[0].status, "corroborated_shadow_candidate");
  assert.equal(result.candidates[0].hex, undefined);
  assert.equal(outfitAnalysis.garment_zones.zones.lower_garment.primary_color.hex, "#3F5041");
});
