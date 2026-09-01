import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluateSemanticColorChallengeV1,
  normalizeColorFamilyForChallengeV1,
} from "../src/intelligence/external/semanticColorChallengeV1.js";

test("normalizes common descriptive families without creating numeric color", () => {
  assert.equal(normalizeColorFamilyForChallengeV1("burgundy"), "red");
  assert.equal(normalizeColorFamilyForChallengeV1("charcoal gray"), "gray");
  assert.equal(normalizeColorFamilyForChallengeV1("navy blue"), "blue");
});

test("matching independent lanes form consensus while VisionCore remains authority", () => {
  const result = evaluateSemanticColorChallengeV1({
    mode: "assist",
    semantic: { family: "burgundy", confidence: 0.93, appearance_cue: "deep wine red" },
    measurement: { family: "red", hex: "#6F263D", confidence: 0.94, source: "visioncore_object_local_measurement" },
  });
  assert.equal(result.disposition, "independent_family_consensus");
  assert.equal(result.consensus, true);
  assert.equal(result.authority_owner, "visioncore");
  assert.equal(result.measurement_lane.hex, "#6F263D");
  assert.equal(result.measured_hex_changed, false);
  assert.equal(result.publication_changed, false);
});

test("strong VisionCore measurement challenges a conflicting semantic interpretation", () => {
  const result = evaluateSemanticColorChallengeV1({
    mode: "shadow",
    semantic: { family: "brown", confidence: 0.77 },
    measurement: { family: "red", hex: "#6F263D", confidence: 0.96 },
  });
  assert.equal(result.disposition, "visioncore_measurement_challenges_semantic");
  assert.equal(result.semantic_reassessment_requested, true);
  assert.equal(result.targeted_remeasurement_requested, false);
  assert.equal(result.semantic_override_allowed, false);
});

test("strong semantic disagreement challenges weak VisionCore measurement only in assist mode", () => {
  const result = evaluateSemanticColorChallengeV1({
    mode: "assist",
    semantic: { family: "red", confidence: 0.97 },
    measurement: { family: "brown", hex: "#78503A", confidence: 0.58 },
  });
  assert.equal(result.disposition, "semantic_challenges_visioncore_measurement");
  assert.equal(result.targeted_remeasurement_requested, true);
  assert.equal(result.measured_hex_changed, false);
  assert.equal(result.publication_changed, false);
});

test("two strong conflicting lanes preserve strong measurement and require nuance synthesis", () => {
  const result = evaluateSemanticColorChallengeV1({
    mode: "assist",
    semantic: { family: "red", confidence: 0.98 },
    measurement: { family: "brown", hex: "#73452D", confidence: 0.92 },
  });
  assert.equal(result.disposition, "two_way_challenge_preserve_measurement_reassess_semantic");
  assert.equal(result.targeted_remeasurement_requested, false);
  assert.equal(result.semantic_reassessment_requested, true);
  assert.equal(result.nuance_synthesis_required, true);
  assert.equal(result.disagreement, true);
  assert.equal(result.authority_owner, "visioncore");
});

test("shadow mode records two-way disagreement but cannot request measurement mutation", () => {
  const result = evaluateSemanticColorChallengeV1({
    mode: "shadow",
    semantic: { family: "green", confidence: 0.99 },
    measurement: { family: "brown", hex: "#79503A", confidence: 0.93 },
  });
  assert.equal(result.disposition, "two_way_disagreement_recorded");
  assert.equal(result.targeted_remeasurement_requested, false);
  assert.equal(result.semantic_reassessment_requested, true);
  assert.equal(result.publication_changed, false);
});

test("missing measurement can request targeted VisionCore evidence acquisition in assist mode", () => {
  const result = evaluateSemanticColorChallengeV1({
    mode: "assist",
    semantic: { family: "blue", confidence: 0.95 },
    measurement: {},
  });
  assert.equal(result.disposition, "measurement_missing");
  assert.equal(result.targeted_remeasurement_requested, true);
  assert.equal(result.semantic_override_allowed, false);
});
