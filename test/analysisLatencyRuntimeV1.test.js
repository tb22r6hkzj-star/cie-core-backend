import test from "node:test";
import assert from "node:assert/strict";
import { createAnalysisLatencyRuntimeV1 } from "../src/intelligence/analysisLatencyRuntimeV1.js";

test("records analysis latency and exposes p50/p95 plus second-pass rate", () => {
  const runtime = createAnalysisLatencyRuntimeV1({ maxRecords: 20 });
  runtime.recordAnalysis({ startedAtMs: 0, finishedAtMs: 4000, stages: { visioncore: 2500 }, secondPass: { used: false } });
  runtime.recordAnalysis({ startedAtMs: 0, finishedAtMs: 9000, stages: { visioncore: 3000, second_pass: 4000 }, secondPass: { used: true, latency_ms: 4000, action: "semantic_reassessment" } });
  runtime.recordAnalysis({ startedAtMs: 0, finishedAtMs: 15000, stages: { visioncore: 3200, second_pass: 7000 }, secondPass: { used: true, latency_ms: 7000, timed_out: true, action: "targeted_visioncore_remeasurement" } });
  const status = runtime.status();
  assert.equal(status.aggregate.sample_count, 3);
  assert.equal(status.aggregate.p50_ms, 9000);
  assert.equal(status.aggregate.p95_ms, 15000);
  assert.equal(status.aggregate.second_pass_rate, 0.667);
  assert.equal(status.aggregate.second_pass_timeout_rate, 0.5);
  assert.equal(status.latest.total_ms, 15000);
  assert.equal(status.latest.performance_class, "slow");
});

test("retention remains bounded and excludes image or semantic payload storage", () => {
  const runtime = createAnalysisLatencyRuntimeV1({ maxRecords: 10 });
  for (let i = 0; i < 15; i += 1) {
    runtime.recordAnalysis({ startedAtMs: 0, finishedAtMs: 1000 + i, secondPass: { used: false } });
  }
  const status = runtime.status();
  assert.equal(runtime.size(), 10);
  assert.equal(status.retention.stored_records, 10);
  assert.equal(status.policy.stores_image_data, false);
  assert.equal(status.policy.stores_prompts, false);
  assert.equal(status.policy.stores_semantic_payloads, false);
});
