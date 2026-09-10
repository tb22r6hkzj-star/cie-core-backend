import test from "node:test";
import assert from "node:assert/strict";
import { validateTargetConditionedMaskRegionsV1 } from "../src/intelligence/targetConditionedMaskValidationV1.js";

function region(id, zone, bbox, coverage) {
  return {
    id,
    zone,
    mask_geometry: { bbox, coverage },
    target_conditioned_mask_v1: { applied: true },
  };
}

function plan(id, zone, bbox) {
  return { targets: [{ id, zone, bbox, detector_region_id: `${id}_detector` }] };
}

test("accepts a garment mask with plausible coverage and detector overlap", () => {
  const result = validateTargetConditionedMaskRegionsV1({
    regions: [region("jacket", "outerwear", { x: 0.2, y: 0.1, w: 0.55, h: 0.45 }, 0.2475)],
    plan: plan("jacket", "outerwear", { x_min: 0.18, y_min: 0.08, x_max: 0.78, y_max: 0.58 }),
  });
  assert.equal(result.validated_count, 1);
  assert.equal(result.regions[0].target_conditioned_mask_v1.spatially_validated, true);
});

test("rejects an undersized garment mask before pixel authority", () => {
  const result = validateTargetConditionedMaskRegionsV1({
    regions: [region("jacket", "outerwear", { x: 0.45, y: 0.2, w: 0.02, h: 0.02 }, 0.0004)],
    plan: plan("jacket", "outerwear", { x_min: 0.2, y_min: 0.1, x_max: 0.8, y_max: 0.6 }),
  });
  assert.equal(result.validated_count, 0);
  assert.ok(result.evaluations[0].reasons.includes("mask_coverage_out_of_zone_bounds"));
});

test("rejects a tiny-accessory prompt that returns a huge garment-sized mask", () => {
  const result = validateTargetConditionedMaskRegionsV1({
    regions: [region("chain", "accessory_jewelry", { x: 0.2, y: 0.1, w: 0.6, h: 0.7 }, 0.42)],
    plan: plan("chain", "accessory_jewelry", { x_min: 0.45, y_min: 0.2, x_max: 0.58, y_max: 0.4 }),
  });
  assert.equal(result.validated_count, 0);
  assert.ok(result.evaluations[0].reasons.includes("mask_coverage_out_of_zone_bounds"));
});

test("rejects masks without independent detector geometry", () => {
  const result = validateTargetConditionedMaskRegionsV1({
    regions: [region("novel", "upper_garment", { x: 0.2, y: 0.1, w: 0.5, h: 0.4 }, 0.2)],
    plan: { targets: [{ id: "novel", zone: "upper_garment", bbox: null }] },
  });
  assert.equal(result.validated_count, 0);
  assert.ok(result.evaluations[0].reasons.includes("detector_box_missing"));
});
