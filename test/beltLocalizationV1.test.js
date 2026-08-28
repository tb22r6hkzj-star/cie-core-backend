import test from "node:test";
import assert from "node:assert/strict";
import { attachBeltLocalizationV1, evaluateBeltCandidateV1 } from "../src/intelligence/beltLocalizationV1.js";
import { mapDinoLabel } from "../src/engines/ontology/dinoMappings.js";

const belt = (bbox = { x: 0.3, y: 0.43, w: 0.4, h: 0.055 }, confidence = 82) => ({
  id: "dino_belt", label: "belt", segment_label: "belt", object_type: "belt",
  accessory_type: "belt", zone: "accessory_jewelry", confidence, bbox,
  source_type: "grounding_dino",
});
const sam = (bbox = { x: 0.29, y: 0.425, w: 0.42, h: 0.065 }) => ({
  id: "sam_belt", source_type: "sam_segment", confidence: 76, mask_url: "https://mask.test/belt.png",
  mask_geometry: { bbox },
});

test("belt aliases retain canonical belt identity", () => {
  for (const label of ["belt", "waist belt", "belt buckle", "waistband belt"]) {
    const mapping = mapDinoLabel(label);
    assert.equal(mapping.accessory_type, "belt");
    assert.equal(mapping.object_type, "belt");
    assert.equal(mapping.display_zone_label, "Belt");
  }
});

test("combined footwear label remains spatial footwear evidence", () => {
  const mapping = mapDinoLabel("shoes sneakers");
  assert.equal(mapping.zone, "footwear");
  assert.equal(mapping.category, "sneakers");
});

test("combined pants/skirt label remains lower-garment evidence", () => {
  const mapped = mapDinoLabel("pants skirt", 0.54);
  assert.equal(mapped?.zone, "lower_garment");
  assert.equal(mapped?.category, "pants");
});

test("DINO waist geometry plus a tight SAM mask validates only in shadow", () => {
  const [result] = attachBeltLocalizationV1([belt()], [sam()]);
  assert.equal(result.belt_localization.validated, true);
  assert.equal(result.belt_localization.reason, "dino_sam_waist_confirmed");
  assert.equal(result.publication_eligible, false);
  assert.equal(result.shadow_only, true);
});

test("DINO-only belt cannot validate or publish", () => {
  const result = evaluateBeltCandidateV1(belt(), []);
  assert.equal(result.validated, false);
  assert.equal(result.reason, "sam_confirmation_required");
});

test("rejects trouser-sized, off-waist, and low-confidence false belts", () => {
  const invalid = [
    belt({ x: 0.2, y: 0.36, w: 0.6, h: 0.5 }),
    belt({ x: 0.3, y: 0.76, w: 0.4, h: 0.05 }),
    belt(undefined, 42),
  ];
  for (const candidate of invalid) assert.equal(evaluateBeltCandidateV1(candidate, [sam()]).validated, false);
});

test("rejects a broad pants SAM mask even when it contains the belt box", () => {
  const pantsMask = sam({ x: 0.24, y: 0.4, w: 0.52, h: 0.5 });
  const result = evaluateBeltCandidateV1(belt(), [pantsMask]);
  assert.equal(result.validated, false);
  assert.equal(result.reason, "sam_confirmation_required");
});
