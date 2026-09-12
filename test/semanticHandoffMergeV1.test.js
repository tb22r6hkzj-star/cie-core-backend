import test from "node:test";
import assert from "node:assert/strict";
import { mergeExternalSemanticHandoffsV1 } from "../src/intelligence/external/semanticHandoffMergeV1.js";

function handoff(claims) {
  return { mode: "assist", semantic_observation: { overall_confidence: 0.9, claims } };
}

test("unifies scene geometry and color observations without granting numeric authority", () => {
  const merged = mergeExternalSemanticHandoffsV1({
    sceneHandoff: handoff([{
      action: "support", piece: "jacket", subtype: "puffer jacket", instance_key: "jacket_1",
      layer_role: "outer", overlaps_instance_keys: ["shirt_1"], material_cue: "quilted nylon",
      segmentation_prompt: "outer puffer jacket", confidence: 0.92,
    }]),
    colorHandoff: handoff([{
      action: "support", piece: "outerwear", instance_key: "jacket_1",
      perceived_color_family: "pink", color_confidence: 0.96, lighting_cue: "flash highlights",
      hex: "#FFFFFF", confidence: 0.96,
    }]),
  });
  assert.equal(merged.semantic_observation.claims.length, 1);
  const claim = merged.semantic_observation.claims[0];
  assert.equal(claim.subtype, "puffer jacket");
  assert.equal(claim.layer_role, "outer");
  assert.deepEqual(claim.overlaps_instance_keys, ["shirt_1"]);
  assert.equal(claim.perceived_color_family, "pink");
  assert.equal(claim.hex, undefined);
  assert.equal(merged.semantic_sources_v1.numeric_color_authority, "visioncore");
});

test("preserves scene-only pieces omitted by the bounded color observer", () => {
  const merged = mergeExternalSemanticHandoffsV1({
    sceneHandoff: handoff([
      { action: "support", piece: "side bag", instance_key: "bag_1", confidence: 0.87 },
      { action: "support", piece: "eyewear", instance_key: "eyewear_1", confidence: 0.91 },
    ]),
    colorHandoff: handoff([]),
  });
  assert.deepEqual(merged.semantic_observation.claims.map((claim) => claim.instance_key), ["bag_1", "eyewear_1"]);
});
