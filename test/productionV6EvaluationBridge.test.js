import test from "node:test";
import assert from "node:assert/strict";
import {
  adaptPerceptionV6ForEvaluation,
  createProductionV6EvaluationInference,
} from "../src/evaluation/productionV6.js";

const rawV6 = {
  consensus: { ratio: 0.82 },
  publication_gating: { allowed: true, score: 0.88, reason: "evidence_threshold_met" },
  object_presence: {
    upper: {
      present: true,
      label: "shirt",
      confidence: 0.91,
      evidence_count: 2,
      object_local_colors: [{ hex: "#223344" }, { hex: "#667788" }],
    },
    headwear: {
      present: false,
      label: "hat",
      confidence: 0.73,
      evidence_count: 1,
      reason: "insufficient_positive_headwear_evidence",
    },
  },
  zone_reconciliation: [
    { zone: "upper", selected_label: "shirt", publication_decision: "publish" },
  ],
  evidence_ledger: [
    {
      id: "region-1",
      zone: "upper",
      accepted: true,
      validation: { reason: "region_pixels_support_candidate", contamination: [] },
    },
  ],
  lifecycle_trace: [
    { stage: "candidate_selection" },
    { stage: "pixel_validation" },
    { stage: "object_local_color_preservation" },
    { stage: "publication" },
  ],
};

test("V6 adapter preserves object-local color and publication evidence", () => {
  const adapted = adaptPerceptionV6ForEvaluation(rawV6);
  const upper = adapted.garment_zones.zones.upper;
  assert.equal(upper.primary_color.hex, "#223344");
  assert.equal(upper.secondary_colors[0].hex, "#667788");
  assert.equal(upper.publication_state, "confirmed");
  assert.equal(upper.publication_reason, "perception_v6_publication_gate_passed");
  assert.ok(upper.evidence_chain.some((row) => row.stage === "pixel_validation"));
  assert.ok(upper.evidence_chain.some((row) => row.stage === "publication_decision"));
  assert.equal(adapted.perception_v6, rawV6);
});

test("V6 adapter keeps rejected accessory candidates rejected", () => {
  const adapted = adaptPerceptionV6ForEvaluation(rawV6);
  const headwear = adapted.garment_zones.zones.headwear;
  assert.equal(headwear.publication_state, "rejected");
  assert.equal(headwear.publication_reason, "insufficient_positive_headwear_evidence");
  assert.equal(headwear.primary_color, null);
});

test("production V6 evaluation inference requires an explicit resolver", () => {
  assert.throws(() => createProductionV6EvaluationInference(), /requires resolveInput/);
});

test("production V6 inference bridge executes the real V6 analyzer", async () => {
  const infer = createProductionV6EvaluationInference({
    resolveInput: async () => ({
      perceptionV5: {
        hypotheses: [{ region_index: 0, strategy: "original", score: 0.9 }],
        normalized_regions: [{ normalized_box: { x: 0, y: 0, x2: 1, y2: 1 } }],
        contradictions: [],
        arbitration: { outcome: "accepted", confidence: 0.9 },
      },
      regions: [{ id: "r1", zone: "upper", label: "shirt", confidence: 0.9, region_colors: [{ hex: "#223344" }] }],
      decodedImage: null,
    }),
  });

  const result = await infer({ image_id: "fixture-production-v6" });
  assert.equal(result.perception_v6.version, "6");
  assert.ok(result.garment_zones.zones.upper);
  assert.equal(result.garment_zones.zones.upper.label, "shirt");
  assert.ok(Array.isArray(result.garment_zones.zones.upper.evidence_chain));
});
