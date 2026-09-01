import test from "node:test";
import assert from "node:assert/strict";
import {
  buildRecommendationRuntimeTelemetryV1,
  createLatencyTelemetryBufferV1,
  summarizeAnalysisLatencyV1,
} from "../src/intelligence/recommendationRuntimeTelemetryIndexV1.js";

test("runtime telemetry bundle exports the live integration primitives", () => {
  assert.equal(typeof buildRecommendationRuntimeTelemetryV1, "function");
  assert.equal(typeof createLatencyTelemetryBufferV1, "function");
  assert.equal(typeof summarizeAnalysisLatencyV1, "function");
});
