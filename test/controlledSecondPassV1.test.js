import test from "node:test";
import assert from "node:assert/strict";
import {
  buildControlledSecondPassPlanV1,
  buildControlledSecondPassPlansV1,
} from "../src/intelligence/controlledSecondPassV1.js";

function synthesis(state, measurementConfidence = 0.9, semanticConfidence = 0.9) {
  return {
    piece: "upper_garment",
    reasoning_state: state,
    measurement_truth: { confidence: measurementConfidence, hex: "#6F263D" },
    appearance_truth: { confidence: semanticConfidence, family: "brown" },
  };
}

test("convergent truth does not consume a second pass", () => {
  const plan = buildControlledSecondPassPlanV1({ synthesis: synthesis("convergent_truth") });
  assert.equal(plan.allowed, false);
  assert.equal(plan.action, "none");
});

test("strong measurement disagreement reassesses semantics without remeasurement", () => {
  const plan = buildControlledSecondPassPlanV1({ synthesis: synthesis("measurement_dominant", 0.94, 0.82) });
  assert.equal(plan.allowed, true);
  assert.equal(plan.action, "semantic_reassessment");
  assert.equal(plan.remeasure_visioncore, false);
  assert.equal(plan.reassess_semantic, true);
  assert.equal(plan.preserve_current_measurement, true);
});

test("explainable divergence preserves measurement and asks semantics to explain appearance", () => {
  const plan = buildControlledSecondPassPlanV1({ synthesis: synthesis("explainable_divergence", 0.95, 0.97) });
  assert.equal(plan.action, "semantic_reassessment_with_measurement_context");
  assert.equal(plan.remeasure_visioncore, false);
  assert.equal(plan.reassess_semantic, true);
  assert.equal(plan.preserve_current_measurement, true);
});

test("appearance alert can remeasure weak VisionCore evidence", () => {
  const plan = buildControlledSecondPassPlanV1({ synthesis: synthesis("appearance_alert", 0.58, 0.96) });
  assert.equal(plan.action, "targeted_visioncore_remeasurement");
  assert.equal(plan.remeasure_visioncore, true);
  assert.equal(plan.force_fresh_segmentation, true);
  assert.equal(plan.preserve_current_measurement, false);
  assert.equal(plan.publication_changed, false);
});

test("integrity correction carries a forced fresh-segmentation directive", () => {
  const row = synthesis("appearance_alert", .55, 1);
  row.integrity_v1 = { force_fresh_segmentation: true, reasons: ["single_color_share_is_not_object_local"] };
  const plan = buildControlledSecondPassPlanV1({ synthesis: row });
  assert.equal(plan.force_fresh_segmentation, true);
  assert.deepEqual(plan.integrity_reasons, ["single_color_share_is_not_object_local"]);
});

test("unresolved conflict remeasures only when measurement is weak", () => {
  const weak = buildControlledSecondPassPlanV1({ synthesis: synthesis("unresolved_conflict", 0.61, 0.97) });
  const strong = buildControlledSecondPassPlanV1({ synthesis: synthesis("unresolved_conflict", 0.93, 0.97) });
  assert.equal(weak.action, "remeasure_then_semantic_reassessment");
  assert.equal(weak.remeasure_visioncore, true);
  assert.equal(strong.action, "semantic_reassessment_with_measurement_context");
  assert.equal(strong.remeasure_visioncore, false);
});

test("hard one-pass cap prevents loops", () => {
  const plan = buildControlledSecondPassPlanV1({ synthesis: synthesis("unresolved_conflict", 0.6, 0.95), attempt: 1 });
  assert.equal(plan.allowed, false);
  assert.equal(plan.reason, "second_pass_limit_reached");
});

test("batch planner returns only actionable plans", () => {
  const plans = buildControlledSecondPassPlansV1([
    synthesis("convergent_truth"),
    synthesis("appearance_alert", 0.5, 0.95),
  ]);
  assert.equal(plans.length, 1);
  assert.equal(plans[0].action, "targeted_visioncore_remeasurement");
});

test("planner deduplicates piece aliases and prioritizes garment remeasurement", () => {
  const plans = buildControlledSecondPassPlansV1([
    { ...synthesis("appearance_alert", 0.5, 0.95), piece: "shoe" },
    { ...synthesis("appearance_alert", 0.5, 0.95), piece: "footwear" },
    { ...synthesis("appearance_alert", 0.5, 0.95), piece: "outerwear", integrity_v1: { force_fresh_segmentation: true } },
  ]);
  assert.equal(plans.length, 2);
  assert.equal(plans[0].piece, "outerwear");
});
