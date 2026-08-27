import test from "node:test";
import assert from "node:assert/strict";
import { evaluateCrossPhotoConsensusV1 } from "../src/intelligence/crossPhotoConsensusV1.js";

function photo(id, hex, disposition = "accept", label = "shirt") {
  return {
    image_id: id,
    capture_quality: { disposition },
    garment_zones: { zones: { upper_garment: { garment_type: label, primary_color: { hex }, confidence: 0.92 } } },
  };
}

test("nearby LAB observations form defensible cross-photo consensus", () => {
  const result = evaluateCrossPhotoConsensusV1({ analyses: [photo("a", "#925133"), photo("b", "#965536"), photo("c", "#905035")] });
  assert.equal(result.available, true);
  assert.equal(result.stable, true);
  assert.equal(result.zones.upper_garment.publication_recommendation, "cross_photo_supported");
  assert.equal(result.zones.upper_garment.supporting_photo_ids.length, 3);
});

test("strong color disagreement is withheld instead of averaged into false certainty", () => {
  const result = evaluateCrossPhotoConsensusV1({ analyses: [photo("a", "#8D4E32"), photo("b", "#244E8A")] });
  assert.equal(result.stable, false);
  assert.equal(result.zones.upper_garment.publication_recommendation, "withhold_or_request_reference");
  assert.equal(result.next_action, "retake_or_measure_physical_reference");
});

test("retake-quality photographs cannot vote in consensus", () => {
  const result = evaluateCrossPhotoConsensusV1({ analyses: [photo("a", "#925133"), photo("b", "#935234"), photo("bad", "#FFFFFF", "retake")] });
  assert.deepEqual(result.excluded_photo_ids, ["bad"]);
  assert.equal(result.zones.upper_garment.supporting_photo_ids.includes("bad"), false);
  assert.equal(result.stable, true);
});

test("one qualified photo cannot claim cross-photo stability", () => {
  const result = evaluateCrossPhotoConsensusV1({ analyses: [photo("a", "#925133"), photo("bad", "#FFFFFF", "retake")] });
  assert.equal(result.available, false);
  assert.equal(result.reason, "at_least_two_qualified_photos_required");
});
