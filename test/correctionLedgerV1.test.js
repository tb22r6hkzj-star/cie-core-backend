import test from "node:test";
import assert from "node:assert/strict";
import { adjudicateCorrectionV1, buildCorrectionLedgerV1, createCorrectionRecordV1 } from "../src/product/correctionLedgerV1.js";

test("a correction preserves the original result and cannot silently change authority", () => {
  const original = { garment_zones: { zones: { upper_garment: { hex: "#935234" } } } };
  const ledger = buildCorrectionLedgerV1({
    analysisId: "analysis-1",
    originalResult: original,
    corrections: [{ zone: "upper_garment", field: "primary_color", originalValue: "#935234", correctedValue: "#8F4E31", reason: "physical swatch" }],
  });
  original.garment_zones.zones.upper_garment.hex = "#FFFFFF";
  assert.equal(ledger.original_result.garment_zones.zones.upper_garment.hex, "#935234");
  assert.equal(ledger.corrections[0].authority_effect, "none_until_adjudicated");
  assert.equal(ledger.policy.correction_cannot_silently_change_publication, true);
});

test("unknown correction fields are rejected", () => {
  assert.throws(() => createCorrectionRecordV1({ analysisId: "a", zone: "shirt", field: "outfit_score", correctedValue: 100 }), /not allowed/);
});

test("accepted correction becomes evaluation-eligible but does not rewrite live publication", () => {
  const record = createCorrectionRecordV1({ analysisId: "a", zone: "upper_garment", field: "identity", originalValue: "jacket", correctedValue: "shirt" });
  const reviewed = adjudicateCorrectionV1(record, { accepted: true, adjudicatorId: "reviewer-1" });
  assert.equal(reviewed.adjudication_status, "accepted");
  assert.equal(reviewed.authority_effect, "eligible_for_evaluation_not_live_rewrite");
});
