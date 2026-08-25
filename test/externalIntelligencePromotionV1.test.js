import test from "node:test";
import assert from "node:assert/strict";
import { evaluateExternalAssistPromotionV1, summarizeExternalShadowOutcomesV1 } from "../src/evaluation/externalIntelligencePromotionV1.js";

test("shadow mode cannot promote without the minimum real sample count", () => {
  const summary = summarizeExternalShadowOutcomesV1([{ outcome: "helped", provider_ok: true, latency_ms: 100, estimated_cost_usd: 0.002 }]);
  const gate = evaluateExternalAssistPromotionV1(summary);
  assert.equal(gate.promoted, false);
  assert.equal(gate.target_mode, "shadow");
  assert.ok(gate.failures.some((failure) => failure.gate === "minimum_samples"));
});

test("one harmful external decision blocks assist promotion", () => {
  const rows = Array.from({ length: 100 }, (_, index) => ({ outcome: index === 0 ? "harmed" : index < 10 ? "helped" : "neutral", provider_ok: true, latency_ms: 500, estimated_cost_usd: 0.002 }));
  const gate = evaluateExternalAssistPromotionV1(summarizeExternalShadowOutcomesV1(rows));
  assert.equal(gate.promoted, false);
  assert.ok(gate.failures.some((failure) => failure.gate === "maximum_harm_rate"));
});

test("assist promotion requires proven help with zero harm and bounded cost", () => {
  const rows = Array.from({ length: 100 }, (_, index) => ({ outcome: index < 10 ? "helped" : "neutral", provider_ok: true, latency_ms: 500, estimated_cost_usd: 0.002 }));
  const gate = evaluateExternalAssistPromotionV1(summarizeExternalShadowOutcomesV1(rows));
  assert.equal(gate.promoted, true);
  assert.equal(gate.target_mode, "assist");
});
