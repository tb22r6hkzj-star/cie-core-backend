import test from "node:test";
import assert from "node:assert/strict";
import { buildAccessoryIntelligenceLaneV1 } from "../src/intelligence/accessoryIntelligenceLaneV1.js";

function reconciliation(piece, family = "metallic_gold", material = "gold tone metal", confidence = 0.94) {
  return {
    candidates: [{
      piece,
      semantic_subtype: piece,
      material_cue: material,
      semantic_confidence: confidence,
      color_crosscheck: { openai_hypothesis: { family } },
    }],
  };
}

test("skin-like earring color forces micro crop and remeasurement even when earring is already detected", () => {
  const lane = buildAccessoryIntelligenceLaneV1({
    outfitAnalysis: {
      accessory_instances_v1: {
        instances: [{
          instance_id: "earrings_1",
          accessory_type: "earrings",
          hex: "#DCB091",
          confidence: 0.45,
          object_local_colors: [{ hex: "#DCB091", pct: 1 }],
          color_publication_decision: "publish_object_local_color",
        }],
      },
    },
    reconciliation: reconciliation("earrings", "metallic_silver", "small metallic stud earrings"),
  });
  assert.deepEqual(lane.forced_micro_crop_targets, ["earrings"]);
  assert.equal(lane.challenges[0].publication_policy, "remeasure_before_publish");
  assert.ok(lane.challenges[0].reasons.includes("skin_like_primary_on_metallic_accessory"));
});

test("live beige watch palette is challenged despite watch identity already existing", () => {
  const lane = buildAccessoryIntelligenceLaneV1({
    outfitAnalysis: {
      accessory_instances_v1: {
        instances: [{
          instance_id: "watch_1",
          accessory_type: "watch",
          hex: "#DDC4A0",
          confidence: 0.79,
          object_local_colors: [
            { hex: "#DDC4A0", pct: 0.09 },
            { hex: "#BEA381", pct: 0.07 },
            { hex: "#A08060", pct: 0.05 },
            { hex: "#7E6142", pct: 0.05 },
          ],
          color_publication_decision: "publish_object_local_color",
        }],
      },
    },
    reconciliation: reconciliation("watch"),
  });
  assert.ok(lane.forced_micro_crop_targets.includes("watch"));
  assert.ok(lane.challenges[0].reasons.includes("skin_like_primary_on_metallic_accessory"));
  assert.ok(lane.challenges[0].reasons.includes("noisy_multi_cluster_accessory_palette"));
});

test("clean validated black belt is preserved and does not consume micro crop budget", () => {
  const lane = buildAccessoryIntelligenceLaneV1({
    outfitAnalysis: {
      accessory_instances_v1: {
        instances: [{
          instance_id: "belt_1",
          accessory_type: "belt",
          hex: "#0D121D",
          confidence: 0.83,
          object_local_colors: [{ hex: "#0D121D", pct: 0.45 }],
          validation_decision: "accepted",
        }],
      },
    },
    reconciliation: { candidates: [] },
  });
  assert.equal(lane.challenged_count, 0);
  assert.deepEqual(lane.forced_micro_crop_targets, []);
});

test("unresolved accessory challenges never grant OpenAI numeric color authority", () => {
  const lane = buildAccessoryIntelligenceLaneV1({
    outfitAnalysis: {
      accessory_instances_v1: {
        instances: [{ accessory_type: "watch", hex: "#DCB091", confidence: 0.4, object_local_colors: [{ hex: "#DCB091", pct: 1 }] }],
      },
    },
    reconciliation: reconciliation("watch"),
  });
  assert.equal(lane.authority_owner, "visioncore");
  assert.equal(lane.publication_gate.openai_numeric_color_authority, false);
  assert.equal(lane.publication_gate.unresolved_challenge_behavior, "identity_only_or_withhold_color");
});
