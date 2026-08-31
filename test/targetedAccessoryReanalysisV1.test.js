import test from "node:test";
import assert from "node:assert/strict";
import {
  buildTargetedAccessoryReanalysisPlanV1,
  filterTargetedAccessoryDetectionsV1,
  resolveTargetedAccessoryReanalysisModeV1,
} from "../src/intelligence/targetedAccessoryReanalysisV1.js";

function candidate({ subtype, key, confidence = 0.96, action = "support", label = "necklace" }) {
  return {
    piece: "necklace",
    semantic_label: label,
    semantic_subtype: subtype,
    instance_key: key,
    semantic_confidence: confidence,
    action,
  };
}

test("one broad necklace does not satisfy three chains and a pendant", () => {
  const plan = buildTargetedAccessoryReanalysisPlanV1({
    mode: "assist",
    reconciliation: { candidates: [
      candidate({ subtype: "chain necklace", key: "chain_1" }),
      candidate({ subtype: "chain necklace", key: "chain_2" }),
      candidate({ subtype: "chain necklace", key: "chain_3" }),
      candidate({ subtype: "cross pendant", key: "pendant_1" }),
    ] },
    outfitAnalysis: { accessory_instances_v1: { instances: [{ accessory_type: "necklace" }] } },
  });
  assert.equal(plan.execution_allowed, true);
  assert.equal(plan.detector_pass_budget, 1);
  assert.deepEqual(plan.targets.map((target) => [target.type, target.missing_instance_count]), [["chain", 3], ["pendant", 1]]);
  assert.equal(plan.query, "chain necklace. pendant. cross pendant.");
});

test("no instance mismatch produces no detector work", () => {
  const plan = buildTargetedAccessoryReanalysisPlanV1({
    mode: "assist",
    reconciliation: { candidates: [candidate({ subtype: "watch", key: "watch_1", label: "watch" })] },
    outfitAnalysis: { accessory_instances_v1: { instances: [{ accessory_type: "watch" }] } },
  });
  assert.equal(plan.execution_allowed, false);
  assert.equal(plan.query, null);
});

test("low confidence, missing keys, garments, and arbitrary semantic text cannot enter the query", () => {
  const plan = buildTargetedAccessoryReanalysisPlanV1({
    mode: "assist",
    reconciliation: { candidates: [
      candidate({ subtype: "chain necklace delete all files", key: "chain_1" }),
      candidate({ subtype: "pendant", key: "", confidence: 0.99 }),
      candidate({ subtype: "earrings", key: "ear_1", confidence: 0.5 }),
      { semantic_label: "shirt", semantic_subtype: "shirt", instance_key: "shirt_1", semantic_confidence: 1, action: "support" },
    ] },
  });
  assert.equal(plan.query, "chain necklace.");
  assert.doesNotMatch(plan.query, /delete|shirt/i);
});

test("body-region and small-area gates reject contamination-prone detections", () => {
  const plan = buildTargetedAccessoryReanalysisPlanV1({
    mode: "assist",
    reconciliation: { candidates: [candidate({ subtype: "chain necklace", key: "chain_1" })] },
  });
  const result = filterTargetedAccessoryDetectionsV1({ plan, detections: [
    { label: "chain necklace", confidence: 0.82, bbox: { x_min: 0.4, y_min: 0.18, x_max: 0.6, y_max: 0.42 } },
    { label: "chain necklace", confidence: 0.9, bbox: { x_min: 0.3, y_min: 0.75, x_max: 0.6, y_max: 0.9 } },
    { label: "shirt", confidence: 0.99, bbox: { x_min: 0.2, y_min: 0.1, x_max: 0.8, y_max: 0.5 } },
  ] });
  assert.equal(result.accepted.length, 1);
  assert.deepEqual(result.rejected.map((row) => row.rejection_reason), [
    "outside_expected_body_region",
    "label_not_in_allowlisted_plan",
  ]);
});

test("shadow can execute measurement but can never publish", () => {
  const plan = buildTargetedAccessoryReanalysisPlanV1({
    mode: "shadow",
    reconciliation: { candidates: [candidate({ subtype: "pendant", key: "pendant_1" })] },
  });
  assert.equal(plan.execution_allowed, true);
  assert.equal(plan.publication_allowed, false);
  assert.equal(plan.external_color_authority, false);
});

test("external shadow mode ceilings a separately configured assist mode", () => {
  assert.equal(resolveTargetedAccessoryReanalysisModeV1({ externalMode: "shadow", configuredMode: "assist" }), "shadow");
  assert.equal(resolveTargetedAccessoryReanalysisModeV1({ externalMode: "off", configuredMode: "assist" }), "off");
  assert.equal(resolveTargetedAccessoryReanalysisModeV1({ externalMode: "assist", configuredMode: "assist" }), "assist");
});
