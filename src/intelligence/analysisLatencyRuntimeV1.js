import { buildAnalysisLatencyRecordV1, summarizeAnalysisLatencyV1 } from "./analysisLatencyTelemetryV1.js";

const DEFAULT_MAX_RECORDS = 200;

export function createAnalysisLatencyRuntimeV1({ maxRecords = DEFAULT_MAX_RECORDS } = {}) {
  const limit = Math.max(10, Math.min(2000, Number(maxRecords) || DEFAULT_MAX_RECORDS));
  const records = [];

  function push(record) {
    if (!record) return null;
    records.push(record);
    if (records.length > limit) records.splice(0, records.length - limit);
    return record;
  }

  function recordAnalysis(input = {}) {
    return push(buildAnalysisLatencyRecordV1(input));
  }

  function summary() {
    return summarizeAnalysisLatencyV1(records);
  }

  function status() {
    const aggregate = summary();
    const latest = records.length ? records[records.length - 1] : null;
    return {
      version: "analysis_latency_runtime_v1",
      retention: { in_memory_only: true, max_records: limit, stored_records: records.length },
      aggregate,
      latest: latest ? {
        total_ms: latest.total_ms,
        performance_class: latest.performance_class,
        stages_ms: latest.stages_ms,
        second_pass: latest.second_pass,
      } : null,
      policy: {
        stores_image_data: false,
        stores_prompts: false,
        stores_semantic_payloads: false,
        intended_for_operational_latency_only: true,
      },
    };
  }

  return {
    recordAnalysis,
    summary,
    status,
    size: () => records.length,
  };
}
