function safeMs(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

function percentile(sorted, p) {
  if (!sorted.length) return null;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

export function buildAnalysisLatencyRecordV1({
  requestId = null,
  startedAtMs,
  finishedAtMs,
  stages = {},
  secondPass = {},
} = {}) {
  const totalMs = safeMs(Number(finishedAtMs) - Number(startedAtMs));
  const normalizedStages = Object.fromEntries(
    Object.entries(stages || {}).map(([key, value]) => [key, safeMs(value)])
  );
  const secondPassMs = safeMs(secondPass?.latency_ms ?? normalizedStages.second_pass);
  return {
    version: "analysis_latency_telemetry_v1",
    request_id: requestId,
    total_ms: totalMs,
    stages_ms: normalizedStages,
    second_pass: {
      used: Boolean(secondPass?.used),
      latency_ms: secondPassMs,
      timed_out: Boolean(secondPass?.timed_out),
      action: secondPass?.action || null,
    },
    performance_class: totalMs == null ? "unknown" : totalMs <= 5000 ? "fast" : totalMs <= 12000 ? "normal" : "slow",
  };
}

export function summarizeAnalysisLatencyV1(records = []) {
  const totals = (Array.isArray(records) ? records : [])
    .map((record) => safeMs(record?.total_ms))
    .filter((value) => value != null)
    .sort((a, b) => a - b);
  const secondPassRecords = (Array.isArray(records) ? records : []).filter((record) => record?.second_pass?.used);
  return {
    version: "analysis_latency_summary_v1",
    sample_count: totals.length,
    p50_ms: percentile(totals, 50),
    p95_ms: percentile(totals, 95),
    max_ms: totals.length ? totals[totals.length - 1] : null,
    second_pass_rate: records?.length ? Number((secondPassRecords.length / records.length).toFixed(3)) : 0,
    second_pass_timeout_rate: secondPassRecords.length
      ? Number((secondPassRecords.filter((record) => record?.second_pass?.timed_out).length / secondPassRecords.length).toFixed(3))
      : 0,
  };
}
