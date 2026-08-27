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
