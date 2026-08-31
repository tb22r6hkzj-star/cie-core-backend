import test from "node:test";
import assert from "node:assert/strict";
import {
  VISIONCORE_EXTERNAL_INTELLIGENCE_POLICY_V1,
  evaluateExternalSemanticHandoffV1,
  sanitizeExternalSemanticObservation,
  validateExternalUsageBudgetV1,
} from "../src/intelligence/visionCoreExternalIntelligencePolicyV1.js";

test("external semantic input cannot inject color math or publication authority", () => {
  const sanitized = sanitizeExternalSemanticObservation({
    provider: "openai",
    hex: "#FF0000",
    publication_decision: "publish",
    score: 100,
    claims: [{
      action: "support",
      piece: "shirt",
      pattern: "solid",
      perceived_color_family: "blue",
      color_appearance_cue: "deep cool blue under neutral light",
      lighting_cue: "soft shadow",
      color_confidence: 0.93,
      confidence: 0.96,
      hex: "#FF0000",
      percentage: 100,
      primary_color: { hex: "#FF0000" },
    }],
  });

  assert.equal(sanitized.hex, undefined);
  assert.equal(sanitized.publication_decision, undefined);
  assert.equal(sanitized.score, undefined);
  assert.equal(sanitized.claims[0].hex, undefined);
  assert.equal(sanitized.claims[0].percentage, undefined);
  assert.equal(sanitized.claims[0].primary_color, undefined);
  assert.equal(sanitized.claims[0].perceived_color_family, "blue");
  assert.equal(sanitized.claims[0].color_confidence, 0.93);
  assert.equal(sanitized.claims[0].color_appearance_cue, "deep cool blue under neutral light");
});

test("unknown semantic color labels are discarded instead of becoming measurements", () => {
  const sanitized = sanitizeExternalSemanticObservation({
    claims: [{ perceived_color_family: "#112233", color_confidence: 98, confidence: 1 }],
  });
  assert.equal(sanitized.claims[0].perceived_color_family, null);
  assert.equal(sanitized.claims[0].color_confidence, 0.98);
  assert.equal(sanitized.claims[0].hex, undefined);
});

test("confirmed VisionCore publication wins an external disagreement", () => {
  const result = evaluateExternalSemanticHandoffV1({
    mode: "assist",
    visionCoreDecision: { publication_state: "confirmed", primary_color: { hex: "#935234" } },
    observation: { claims: [{ action: "contradict", piece: "shirt", reason: "looks red", confidence: 0.95 }] },
  });

  assert.equal(result.disposition, "visioncore_confirmed_preserve_and_log_conflict");
  assert.equal(result.publication_changed, false);
  assert.equal(result.external_override_allowed, false);
});

test("uncertain VisionCore evidence can request reanalysis but cannot publish", () => {
  const result = evaluateExternalSemanticHandoffV1({
    mode: "assist",
    visionCoreDecision: { publication_state: "possible" },
    observation: { claims: [{ action: "request_targeted_reanalysis", piece: "belt", confidence: 0.91 }] },
  });

  assert.equal(result.targeted_reanalysis_requested, true);
  assert.equal(result.disposition, "targeted_reanalysis_required_before_publication");
  assert.equal(result.publication_changed, false);
});

test("external semantics can neither create nor collapse a multicolor result", () => {
  const createAttempt = evaluateExternalSemanticHandoffV1({
    mode: "assist",
    visionCoreDecision: { publication_state: "possible", detected_colors: [{ hex: "#935234", ownership_supported: true }] },
    observation: { claims: [{ action: "support", piece: "shirt", pattern: "striped", confidence: 0.97 }] },
  });
  assert.equal(createAttempt.multicolor.semantic_claim_present, true);
  assert.equal(createAttempt.multicolor.measured_visioncore_support_present, false);
  assert.equal(createAttempt.multicolor.external_claim_can_create_multicolor_publication, false);

  const collapseAttempt = evaluateExternalSemanticHandoffV1({
    mode: "assist",
    visionCoreDecision: {
      publication_state: "confirmed",
      detected_colors: [
        { hex: "#935234", ownership_supported: true },
        { hex: "#3F5041", ownership_supported: true },
      ],
    },
    observation: { claims: [{ action: "contradict", piece: "shirt", pattern: "solid", confidence: 0.99 }] },
  });
  assert.equal(collapseAttempt.multicolor.measured_visioncore_support_present, true);
  assert.equal(collapseAttempt.multicolor.external_claim_can_collapse_multicolor_publication, false);
});

test("shadow mode is guaranteed record-only", () => {
  const result = evaluateExternalSemanticHandoffV1({
    mode: "shadow",
    visionCoreDecision: { publication_state: "possible" },
    observation: { claims: [{ action: "contradict", confidence: 1 }] },
  });
  assert.equal(result.disposition, "record_only_no_publication_change");
  assert.equal(result.targeted_reanalysis_requested, false);
  assert.equal(result.publication_changed, false);
});

test("external usage budget blocks excess calls and costs", () => {
  assert.equal(validateExternalUsageBudgetV1({ normalCalls: 1, escalationCalls: 1, estimatedCostUsd: 0.03 }).allowed, true);
  const blocked = validateExternalUsageBudgetV1({ normalCalls: 2, escalationCalls: 2, estimatedCostUsd: 0.031 });
  assert.equal(blocked.allowed, false);
  assert.deepEqual(blocked.violations, [
    "normal_call_limit_exceeded",
    "escalation_call_limit_exceeded",
    "external_cost_ceiling_exceeded",
  ]);
});

test("policy assigns every final authority to VisionCore", () => {
  const authority = VISIONCORE_EXTERNAL_INTELLIGENCE_POLICY_V1.authority;
  assert.equal(authority.color_measurement, "visioncore");
  assert.equal(authority.spatial_ownership, "visioncore");
  assert.equal(authority.publication, "visioncore");
  assert.equal(authority.scoring, "visioncore");
  assert.equal(authority.recommendation_constraints, "visioncore");
});
