import test from "node:test";
import assert from "node:assert/strict";
import {
  bindEarlySegmentationToFinalPlanV1,
  mergeTargetConditionedSegmentationsV1,
  segmentationPlanBindingEnabledV1,
} from "../src/intelligence/targetConditionedSegmentationBindingV1.js";

function target(id, zone, detectorRegionId, overrides = {}) {
  return {
    id,
    zone,
    label: zone,
    prompt: zone,
    confidence: 0.9,
    detector_region_id: detectorRegionId,
    bbox: detectorRegionId ? { x_min: 0.1, y_min: 0.1, x_max: 0.4, y_max: 0.4 } : null,
    semantic_instance_key: null,
    layer_role: "unknown",
    source: detectorRegionId ? "detector_fallback" : "semantic_target",
    ...overrides,
  };
}

function segmentation(plan, targets) {
  return {
    ok: true,
    provider: "fal",
    providers: ["fal"],
    plan,
    regions: targets.map((entry) => ({
      id: entry.id,
      zone: entry.zone,
      label: entry.label,
      segment_label: entry.label,
      mask_url: `https://masks.test/${entry.id}.png`,
      target_conditioned_mask_v1: {
        applied: true,
        detector_region_id: entry.detector_region_id,
        semantic_instance_key: entry.semantic_instance_key,
      },
    })),
    results: targets.map((entry) => ({ ok: true, provider: "fal", target: entry })),
  };
}

test("early detector masks bind to matching semantic targets and preserve their originating plan", () => {
  const earlyTargets = [
    target("target_mask_lower_garment", "lower_garment", "dino_shorts", { label: "shorts" }),
    target("target_mask_footwear", "footwear", "dino_left_shoe", { label: "shoes" }),
  ];
  const finalTargets = [
    target("target_mask_shorts_1", "lower_garment", "dino_shorts", {
      label: "athletic shorts", semantic_instance_key: "shorts_1", source: "semantic_plus_detector",
    }),
    target("target_mask_shoe_1", "footwear", "dino_left_shoe", {
      label: "sneaker", semantic_instance_key: "shoe_1", source: "semantic_plus_detector",
    }),
    target("target_mask_shoe_2", "footwear", "dino_right_shoe", {
      label: "sneaker", semantic_instance_key: "shoe_2", source: "semantic_plus_detector",
    }),
    target("target_mask_jacket_1", "outerwear", null, {
      label: "track jacket", semantic_instance_key: "jacket_1", source: "semantic_target",
    }),
  ];
  const prepared = bindEarlySegmentationToFinalPlanV1({
    earlySegmentation: segmentation({ targets: earlyTargets }, earlyTargets),
    finalPlan: { targets: finalTargets },
  });

  assert.deepEqual(prepared.segmentation.regions.map((region) => region.id), [
    "target_mask_shorts_1", "target_mask_shoe_1",
  ]);
  assert.equal(prepared.segmentation.regions[0].target_conditioned_mask_v1.semantic_instance_key, "shorts_1");
  assert.deepEqual(prepared.missing_plan.targets.map((entry) => entry.id), [
    "target_mask_shoe_2", "target_mask_jacket_1",
  ]);
  assert.ok(prepared.validation_plan.targets.every((entry) => entry.id !== "target_mask_lower_garment"));
});

test("unmatched early targets remain bound to their own detector plan instead of becoming target null", () => {
  const earlyHat = target("target_mask_accessory_jewelry", "accessory_jewelry", "dino_hat", { label: "hat" });
  const finalWatch = target("target_mask_watch_1", "accessory_jewelry", null, {
    label: "wristwatch", semantic_instance_key: "watch_1", source: "semantic_target",
  });
  const prepared = bindEarlySegmentationToFinalPlanV1({
    earlySegmentation: segmentation({ targets: [earlyHat] }, [earlyHat]),
    finalPlan: { targets: [finalWatch] },
  });

  assert.equal(prepared.segmentation.regions[0].id, earlyHat.id);
  assert.ok(prepared.validation_plan.targets.some((entry) => entry.id === earlyHat.id));
  assert.deepEqual(prepared.missing_plan.targets.map((entry) => entry.id), [finalWatch.id]);
});

test("merging supplemental semantic masks keeps one validation contract and both providers", () => {
  const earlyTarget = target("early", "lower_garment", "dino_1");
  const lateTarget = target("late", "outerwear", null, { semantic_instance_key: "jacket_1" });
  const merged = mergeTargetConditionedSegmentationsV1({
    base: segmentation({ targets: [earlyTarget, lateTarget] }, [earlyTarget]),
    supplement: { ...segmentation({ targets: [lateTarget] }, [lateTarget]), provider: "replicate", providers: ["replicate"] },
    validationPlan: { targets: [earlyTarget, lateTarget] },
  });
  assert.deepEqual(merged.regions.map((region) => region.id), ["early", "late"]);
  assert.deepEqual(merged.providers, ["fal", "replicate"]);
  assert.equal(merged.provider, "mixed");
  assert.equal(merged.plan.targets.length, 2);
});

test("plan binding is system-wide by default and has an immediate environment rollback", () => {
  assert.equal(segmentationPlanBindingEnabledV1({}), true);
  assert.equal(segmentationPlanBindingEnabledV1({ VISIONCORE_SEGMENTATION_PLAN_BINDING_V1: "off" }), false);
  assert.equal(segmentationPlanBindingEnabledV1({ VISIONCORE_SEGMENTATION_PLAN_BINDING_V1: "false" }), false);
});
