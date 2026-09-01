import test from "node:test";
import assert from "node:assert/strict";
import {
  buildAppearanceMeasurementSynthesisV1,
  buildAppearanceMeasurementSynthesesV1,
} from "../src/intelligence/appearanceMeasurementSynthesisV1.js";

function candidate({ disposition, semanticFamily = "red", measuredFamily = "red", semanticConfidence = 0.9, measurementConfidence = 0.92, appearanceCue = null, lightingCue = null, challenge = {}, remeasurement = false } = {}) {
  return {
    piece: "upper_garment",
    color_crosscheck: {
      disposition,
      openai_hypothesis: {
        family: semanticFamily,
        confidence: semanticConfidence,
        appearance_cue: appearanceCue,
        lighting_cue: lightingCue,
      },
      visioncore_measurement: {
        available: true,
        family: measuredFamily,
        hex: "#6F263D",
        confidence: measurementConfidence,
        source: "visioncore_object_local_measurement",
      },
      bidirectional_challenge: challenge,
      remeasurement_requested: remeasurement,
      semantic_reassessment_requested: challenge?.semantic_reassessment_requested === true,
    },
  };
}

test("matching truths produce compact consensus card copy", () => {
  const result = buildAppearanceMeasurementSynthesisV1(candidate({
    disposition: "independent_color_family_corroboration",
  }));
  assert.equal(result.reasoning_state, "convergent_truth");
  assert.equal(result.card.appearance_note, "Matches measured color");
  assert.equal(result.card.reason, null);
  assert.equal(result.card.confidence, "High");
  assert.equal(result.measurement_truth.hex, "#6F263D");
  assert.equal(result.publication_changed, false);
});

test("different appearance and measurement can both be retained as explainable divergence", () => {
  const result = buildAppearanceMeasurementSynthesisV1(candidate({
    disposition: "visioncore_strong_measurement_preserved",
    semanticFamily: "brown",
    measuredFamily: "red",
    semanticConfidence: 0.97,
    measurementConfidence: 0.94,
    appearanceCue: "brownish burgundy",
    lightingCue: "warm indoor lighting",
    challenge: {
      disagreement: true,
      nuance_synthesis_required: true,
      semantic_reassessment_requested: true,
    },
  }));
  assert.equal(result.reasoning_state, "explainable_divergence");
  assert.equal(result.appearance_truth.family, "brown");
  assert.equal(result.measurement_truth.family, "red");
  assert.equal(result.card.appearance_note, "Appears brownish burgundy");
  assert.equal(result.card.reason, "Warm lighting");
  assert.equal(result.relationship.explainable_divergence, true);
  assert.equal(result.measured_hex_changed, false);
});

test("strong measurement remains dominant when semantic disagreement lacks nuance evidence", () => {
  const result = buildAppearanceMeasurementSynthesisV1(candidate({
    disposition: "visioncore_strong_measurement_preserved",
    semanticFamily: "brown",
    measuredFamily: "red",
    appearanceCue: null,
    lightingCue: null,
    challenge: { disagreement: true, semantic_reassessment_requested: true },
  }));
  assert.equal(result.reasoning_state, "measurement_dominant");
  assert.equal(result.card.appearance_note, "Appears Brown");
  assert.equal(result.card.reason, null);
  assert.equal(result.authority_owner, "visioncore");
});

test("weak measurement challenged by strong appearance becomes an appearance alert", () => {
  const result = buildAppearanceMeasurementSynthesisV1(candidate({
    disposition: "targeted_visioncore_remeasurement_requested",
    semanticFamily: "blue",
    measuredFamily: "gray",
    semanticConfidence: 0.97,
    measurementConfidence: 0.55,
    lightingCue: "low light",
    remeasurement: true,
    challenge: { disagreement: true, targeted_remeasurement_requested: true },
  }));
  assert.equal(result.reasoning_state, "appearance_alert");
  assert.equal(result.relationship.targeted_remeasurement_requested, true);
  assert.equal(result.card.reason, "Low light");
});

test("card text remains deliberately short", () => {
  const result = buildAppearanceMeasurementSynthesisV1(candidate({
    disposition: "visioncore_strong_measurement_preserved",
    semanticFamily: "brown",
    measuredFamily: "red",
    appearanceCue: "a very long description of a warm brown leaning reddish appearance under difficult conditions",
    lightingCue: "warm indoor lighting with multiple mixed sources",
    challenge: { disagreement: true, nuance_synthesis_required: true },
  }));
  assert.ok((result.card.appearance_note || "").length <= 46);
  assert.ok((result.card.reason || "").length <= 28);
});

test("batch synthesis only emits candidates with color crosschecks", () => {
  const result = buildAppearanceMeasurementSynthesesV1({
    candidates: [candidate({ disposition: "independent_color_family_corroboration" }), { piece: "belt" }],
  });
  assert.equal(result.length, 1);
  assert.equal(result[0].piece, "upper_garment");
});
