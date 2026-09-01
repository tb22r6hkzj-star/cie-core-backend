import { buildAnalysisLatencyRecordV1 } from "./analysisLatencyTelemetryV1.js";

function safeMs(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

/**
 * Runtime adapter for /api/recommendations.
 *
 * The route owns the actual timestamps. This adapter converts them into the
 * privacy-safe telemetry contract without retaining image, garment, prompt,
 * or semantic payload contents.
 */
export function buildRecommendationRuntimeTelemetryV1({
  requestId = null,
  requestStartedAtMs,
  requestFinishedAtMs,
  visionCoreStartedAtMs = null,
  visionCoreFinishedAtMs = null,
  openAIResult = null,
  synthesisStartedAtMs = null,
  synthesisFinishedAtMs = null,
  secondPassResult = null,
} = {}) {
  const stages = {
    visioncore: visionCoreStartedAtMs != null && visionCoreFinishedAtMs != null
      ? safeMs(Number(visionCoreFinishedAtMs) - Number(visionCoreStartedAtMs))
      : null,
    openai_observer: safeMs(openAIResult?.latency_ms),
    synthesis: synthesisStartedAtMs != null && synthesisFinishedAtMs != null
      ? safeMs(Number(synthesisFinishedAtMs) - Number(synthesisStartedAtMs))
      : null,
    second_pass: safeMs(secondPassResult?.latency_ms),
  };

  const secondPassResults = Array.isArray(secondPassResult?.results) ? secondPassResult.results : [];
  const timedOut = secondPassResults.some((entry) =>
    entry?.visioncore_remeasurement?.reason === "timeout" ||
    entry?.semantic_reassessment?.reason === "timeout"
  );
  const action = secondPassResults.find((entry) => entry?.plan?.action)?.plan?.action || null;

  return buildAnalysisLatencyRecordV1({
    requestId,
    startedAtMs: requestStartedAtMs,
    finishedAtMs: requestFinishedAtMs,
    stages,
    secondPass: {
      used: Number(secondPassResult?.executed_count || 0) > 0,
      latency_ms: secondPassResult?.latency_ms,
      timed_out: timedOut,
      action,
    },
  });
}

/**
 * Bounded in-memory buffer suitable for a single process. It intentionally
 * stores only sanitized latency records and never request payloads.
 */
export function createLatencyTelemetryBufferV1({ maxRecords = 500 } = {}) {
  const limit = Math.max(10, Math.min(5000, Math.round(Number(maxRecords) || 500)));
  const records = [];
  return {
    push(record) {
      if (!record || record?.version !== "analysis_latency_telemetry_v1") return false;
      records.push(record);
      while (records.length > limit) records.shift();
      return true;
    },
    snapshot() {
      return records.map((record) => structuredClone(record));
    },
    size() {
      return records.length;
    },
    clear() {
      records.length = 0;
    },
  };
}
