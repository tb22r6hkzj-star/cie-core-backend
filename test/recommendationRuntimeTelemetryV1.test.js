import test from "node:test";
import assert from "node:assert/strict";
import {
  buildRecommendationRuntimeTelemetryV1,
  createLatencyTelemetryBufferV1,
} from "../src/intelligence/recommendationRuntimeTelemetryV1.js";

test("builds sanitized recommendation telemetry with stage timing", () => {
  const record = buildRecommendationRuntimeTelemetryV1({
    requestId: "req-1",
    requestStartedAtMs: 1000,
    requestFinishedAtMs: 6200,
    visionCoreStartedAtMs: 1100,
    visionCoreFinishedAtMs: 3500,
    openAIResult: { latency_ms: 1200, semantic_observation: { private: "not retained" } },
    synthesisStartedAtMs: 3600,
    synthesisFinishedAtMs: 3650,
    secondPassResult: {
      latency_ms: 700,
      executed_count: 1,
      results: [{ plan: { action: "semantic_reassessment" }, semantic_reassessment: { ok: true } }],
    },
  });

  assert.equal(record.total_ms, 5200);
  assert.equal(record.stages_ms.visioncore, 2400);
  assert.equal(record.stages_ms.openai_observer, 1200);
  assert.equal(record.stages_ms.synthesis, 50);
  assert.equal(record.second_pass.used, true);
  assert.equal(record.second_pass.action, "semantic_reassessment");
  assert.equal("semantic_observation" in record, false);
});

test("detects second-pass timeout without retaining executor payloads", () => {
  const record = buildRecommendationRuntimeTelemetryV1({
    requestStartedAtMs: 0,
    requestFinishedAtMs: 14000,
    secondPassResult: {
      latency_ms: 7000,
      executed_count: 1,
      results: [{
        plan: { action: "targeted_visioncore_remeasurement" },
        visioncore_remeasurement: { ok: false, reason: "timeout", error: "sensitive internal detail" },
      }],
    },
  });
  assert.equal(record.second_pass.timed_out, true);
  assert.equal(record.performance_class, "slow");
  assert.equal("error" in record.second_pass, false);
});

test("bounded buffer retains only telemetry records and evicts oldest", () => {
  const buffer = createLatencyTelemetryBufferV1({ maxRecords: 10 });
  for (let i = 0; i < 12; i += 1) {
    buffer.push({ version: "analysis_latency_telemetry_v1", request_id: `r-${i}` });
  }
  assert.equal(buffer.size(), 10);
  assert.equal(buffer.snapshot()[0].request_id, "r-2");
  assert.equal(buffer.push({ version: "wrong" }), false);
});
