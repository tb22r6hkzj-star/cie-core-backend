import test from "node:test";
import assert from "node:assert/strict";
import {
  buildSemanticSceneGraphV1,
  buildTargetConditionedSegmentationPlanV1,
  normalizeSemanticGarmentZoneV1,
} from "../src/intelligence/semanticMaskOrchestrationV1.js";

function handoff(claims) {
  return { semantic_observation: { claims } };
}

function claim(overrides = {}) {
  return {
    action: "support",
    piece: "garment",
    subtype: "shirt",
    instance_key: "shirt_1",
    zone: "upper_garment",
    layer_role: "standalone",
    overlaps_instance_keys: [],
    occlusion: "none",
    unusual_detail: null,
    segmentation_prompt: "visible shirt garment",
    confidence: 0.9,
    ...overrides,
  };
}

test("unfamiliar one-piece garments become general semantic mask targets", () => {
  assert.equal(normalizeSemanticGarmentZoneV1("structured romper"), "body_garment");
  const plan = buildTargetConditionedSegmentationPlanV1({
    semanticHandoff: handoff([claim({
      subtype: "structured romper",
      instance_key: "romper_1",
      zone: "body",
      segmentation_prompt: "structured one-piece romper garment",
      unusual_detail: "asymmetric waist panel",
    })]),
  });
  assert.equal(plan.targets.length, 1);
  assert.equal(plan.targets[0].zone, "body_garment");
  assert.equal(plan.targets[0].source, "semantic_target");
  assert.equal(plan.targets[0].unusual_detail, "asymmetric waist panel");
});

test("compound fashion names use token boundaries instead of substring collisions", () => {
  assert.equal(normalizeSemanticGarmentZoneV1("low-top sneakers"), "footwear");
  assert.equal(normalizeSemanticGarmentZoneV1("cropped top"), "upper_garment");
  assert.equal(normalizeSemanticGarmentZoneV1("wallet or trouser chain"), "accessory_jewelry");
});

test("overlapping garments remain separate targets even inside the same zone", () => {
  const claims = [
    claim({
      subtype: "button shirt",
      instance_key: "shirt_inner",
      layer_role: "inner",
      overlaps_instance_keys: ["hoodie_outer"],
      occlusion: "partial",
      segmentation_prompt: "partially visible button shirt under hoodie",
    }),
    claim({
      subtype: "cropped hoodie",
      instance_key: "hoodie_outer",
      layer_role: "outer",
      overlaps_instance_keys: ["shirt_inner"],
      segmentation_prompt: "cropped hoodie garment",
    }),
  ];
  const plan = buildTargetConditionedSegmentationPlanV1({
    semanticHandoff: handoff(claims),
    dinoRegions: [{ id: "upper_box", zone: "upper_garment", label: "upper clothing", confidence: 0.84, bbox: [1, 2, 30, 40] }],
  });
  assert.equal(plan.targets.length, 2);
  assert.deepEqual(new Set(plan.targets.map((target) => target.semantic_instance_key)), new Set(["shirt_inner", "hoodie_outer"]));
  assert.deepEqual(new Set(plan.targets.map((target) => target.layer_role)), new Set(["inner", "outer"]));
});

test("scene graph preserves tiny details but never grants external color authority", () => {
  const graph = buildSemanticSceneGraphV1(handoff([claim({
    unusual_detail: "small embroidered cross patches near the knees",
    segmentation_prompt: "wide-leg jeans with embroidered knee patches",
  })]));
  assert.equal(graph.unusual_detail_count, 1);
  assert.equal(graph.external_color_authority, false);
  assert.equal(graph.authority_owner, "visioncore");
  assert.equal(graph.pieces[0].authority, "semantic_advisory");
  assert.equal(graph.pieces[0].hex, undefined);
});

test("segmentation prompts are forced color-neutral before mask generation", () => {
  const plan = buildTargetConditionedSegmentationPlanV1({
    semanticHandoff: handoff([claim({
      subtype: "jacket",
      instance_key: "jacket_1",
      segmentation_prompt: "bright pink outer jacket with silver zipper",
    })]),
  });
  assert.equal(plan.targets[0].prompt, "bright outer jacket with zipper");
});

test("detector fallback still creates targets when semantic reasoning is unavailable", () => {
  const plan = buildTargetConditionedSegmentationPlanV1({
    dinoRegions: [
      { id: "coat_box", zone: "outerwear", label: "coat", confidence: 0.79, bbox: [2, 3, 50, 90] },
      { id: "shoe_box", zone: "footwear", label: "shoe", confidence: 0.2, bbox: [4, 80, 20, 99] },
    ],
  });
  assert.deepEqual(new Set(plan.targets.map((target) => target.zone)), new Set(["outerwear", "footwear"]));
  assert.ok(plan.targets.every((target) => target.source === "detector_fallback"));
});

test("tiny accessories become independently measurable targets", () => {
  const plan = buildTargetConditionedSegmentationPlanV1({
    semanticHandoff: handoff([claim({
      piece: "jewelry",
      subtype: "cross pendant",
      instance_key: "pendant_1",
      zone: "neck",
      layer_role: "accessory",
      segmentation_prompt: "small cross pendant on necklace chain",
    })]),
  });
  assert.equal(plan.targets[0].zone, "accessory_jewelry");
  assert.equal(plan.targets[0].semantic_instance_key, "pendant_1");
});

test("weak detector guesses do not become pixel-ownership targets", () => {
  const plan = buildTargetConditionedSegmentationPlanV1({
    dinoRegions: [
      { id: "weak_top", zone: "upper_garment", label: "shirt", confidence: 0.2 },
      { id: "weak_shoe", zone: "footwear", label: "shoe", confidence: 0.1 },
      { id: "face", zone: "face", label: "face", confidence: 0.99 },
    ],
  });
  assert.equal(plan.targets.length, 0);
});
