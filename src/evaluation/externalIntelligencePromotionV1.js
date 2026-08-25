function rate(count, total) {
  return total > 0 ? count / total : 0;
}

export function summarizeExternalShadowOutcomesV1(records = []) {
  const rows = Array.isArray(records) ? records : [];
  const helped = rows.filter((row) => row?.outcome === "helped").length;
  const harmed = rows.filter((row) => row?.outcome === "harmed").length;
  const neutral = rows.filter((row) => row?.outcome === "neutral").length;
  const failures = rows.filter((row) => row?.provider_ok === false).length;
  const latencies = rows.map((row) => Number(row?.latency_ms)).filter(Number.isFinite).sort((a, b) => a - b);
  const costs = rows.map((row) => Number(row?.estimated_cost_usd || 0)).filter(Number.isFinite);
  const p95Index = latencies.length ? Math.min(latencies.length - 1, Math.ceil(latencies.length * 0.95) - 1) : 0;
  return {
    sample_count: rows.length,
    helped_count: helped,
    harmed_count: harmed,
    neutral_count: neutral,
    provider_failure_count: failures,
    help_rate: rate(helped, rows.length),
    harm_rate: rate(harmed, rows.length),
    provider_failure_rate: rate(failures, rows.length),
    p95_latency_ms: latencies[p95Index] || 0,
    average_cost_usd: costs.length ? costs.reduce((sum, value) => sum + value, 0) / costs.length : 0,
  };
}

export function evaluateExternalAssistPromotionV1(summary = {}, thresholds = {}) {
  const limits = {
    minimum_samples: Number(thresholds.minimum_samples ?? 100),
    minimum_help_rate: Number(thresholds.minimum_help_rate ?? 0.05),
    maximum_harm_rate: Number(thresholds.maximum_harm_rate ?? 0),
    maximum_provider_failure_rate: Number(thresholds.maximum_provider_failure_rate ?? 0.02),
    maximum_p95_latency_ms: Number(thresholds.maximum_p95_latency_ms ?? 8000),
    maximum_average_cost_usd: Number(thresholds.maximum_average_cost_usd ?? 0.01),
  };
  const failures = [];
  for (const [gate, actual, threshold, direction] of [
    ["minimum_samples", summary.sample_count || 0, limits.minimum_samples, "min"],
    ["minimum_help_rate", summary.help_rate || 0, limits.minimum_help_rate, "min"],
    ["maximum_harm_rate", summary.harm_rate || 0, limits.maximum_harm_rate, "max"],
    ["maximum_provider_failure_rate", summary.provider_failure_rate || 0, limits.maximum_provider_failure_rate, "max"],
    ["maximum_p95_latency_ms", summary.p95_latency_ms || 0, limits.maximum_p95_latency_ms, "max"],
    ["maximum_average_cost_usd", summary.average_cost_usd || 0, limits.maximum_average_cost_usd, "max"],
  ]) {
    if ((direction === "min" && actual < threshold) || (direction === "max" && actual > threshold)) failures.push({ gate, actual, threshold });
  }
  return { promoted: failures.length === 0, target_mode: failures.length ? "shadow" : "assist", failures, limits };
}
