import test from "node:test";
import assert from "node:assert/strict";
import { buildAnalysisLatencyRecordV1, summarizeAnalysisLatencyV1 } from "../src/intelligence/analysisLatencyTelemetryV1.js";

test("builds a bounded per-analysis latency record", () => {
  const record = buildAnalysisLatencyRecordV1({
    requestId: "req-1",
    startedAtMs: 1000,
    finishedAtMs: 8200,
    stages: { visioncore: 3500, openai_observer: 2200, synthesis: 20, second_pass: 1400 },
    secondPass: { used: true, latency_ms: 1400, action: "semantic_reassessment" },
  });
  assert.equal(record.total_ms, 7200);
  assert.equal(record.performance_class, "normal");
  assert.equal(record.second_pass.used, true);
  assert.equal(record.second_pass.latency_ms, 1400);
});

test("summarizes p50 and p95 without exposing payload contents", () => {
  const records = [1000, 2000, 3000, 4000, 12000, 16000].map((total_ms, index) => ({
    total_ms,
    second_pass: { used: index >= 4, timed_out: index === 5 },
  }));
  const summary = summarizeAnalysisLatencyV1(records);
  assert.equal(summary.sample_count, 6);
  assert.equal(summary.p50_ms, 3000);
  assert.equal(summary.p95_ms, 16000);
  assert.equal(summary.second_pass_rate, 0.333);
  assert.equal(summary.second_pass_timeout_rate, 0.5);
});
