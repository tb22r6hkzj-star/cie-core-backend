import test from "node:test";
import assert from "node:assert/strict";
import { buildConsumerEvidenceV1 } from "../src/intelligence/consumerEvidenceV1.js";

test("consumer evidence keeps photographed and estimated garment colors distinct", () => {
  const result = buildConsumerEvidenceV1({
    captureQuality: { disposition: "review" },
    outfitAnalysis: { garment_zones: { zones: { upper_garment: {
      garment_type: "shirt",
      hex: "#935234",
      legacy_diagnostic: { hex: "#A86A4B" },
      confidence: 88,
      evidence_ids: ["mask", "interior"],
    } } } },
  });
  assert.equal(result.pieces.upper_garment.captured_color.hex, "#A86A4B");
  assert.equal(result.pieces.upper_garment.estimated_garment_color.hex, "#935234");
  assert.equal(result.pieces.upper_garment.confidence, 0.88);
  assert.equal(result.language_policy.never_call_photo_pixels_physical_truth, true);
});

test("bad capture cannot support an intrinsic-color claim", () => {
  const result = buildConsumerEvidenceV1({ captureQuality: { disposition: "retake" } });
  assert.equal(result.intrinsic_color_claim_allowed, false);
});

test("consumer evidence exposes short synthesis copy without replacing measured color", () => {
  const result = buildConsumerEvidenceV1({
    captureQuality: { disposition: "review" },
    outfitAnalysis: {
      garment_zones: { zones: { upper_garment: {
        garment_type: "shirt",
        primary_color: { hex: "#6F263D" },
        confidence: 94,
      } } },
      external_intelligence: {
        semantic_reconciliation: {
          candidates: [{
            piece: "upper_garment",
            color_crosscheck: {
              disposition: "visioncore_strong_measurement_preserved",
              openai_hypothesis: {
                family: "brown",
                confidence: 0.97,
                appearance_cue: "brownish burgundy",
                lighting_cue: "warm indoor lighting",
              },
              visioncore_measurement: {
                available: true,
                family: "red",
                hex: "#6F263D",
                confidence: 0.94,
                source: "visioncore_object_local_measurement",
              },
              semantic_reassessment_requested: true,
              bidirectional_challenge: {
                disagreement: true,
                nuance_synthesis_required: true,
              },
            },
          }],
        },
      },
    },
  });

  const piece = result.pieces.upper_garment;
  assert.equal(piece.estimated_garment_color.hex, "#6F263D");
  assert.deepEqual(piece.color_reasoning, {
    state: "explainable_divergence",
    appearance_note: "Appears brownish burgundy",
    reason: "Warm lighting",
    confidence: "High",
  });
  assert.equal(result.language_policy.color_reasoning_copy_stays_compact, true);
  assert.equal(result.language_policy.appearance_and_measurement_can_both_be_true, true);
});
