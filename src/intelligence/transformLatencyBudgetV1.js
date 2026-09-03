export function createTransformLatencyBudgetV1({ totalMs = 50000, reserveMs = 5000, startedAt = Date.now() } = {}) {
  const total = Math.max(10000, Number(totalMs) || 50000);
  const reserve = Math.max(1000, Math.min(total - 1000, Number(reserveMs) || 5000));
  const deadlineAt = startedAt + total;
  const usableDeadlineAt = deadlineAt - reserve;
  const now = () => Date.now();
  const remainingMs = () => Math.max(0, usableDeadlineAt - now());
  const canRun = (minimumMs = 0) => remainingMs() >= Math.max(0, Number(minimumMs) || 0);
  const providerTimeoutMs = ({ requestedMs, minimumMs = 1500, maximumMs = Infinity } = {}) => {
    const remaining = remainingMs();
    const requested = Number.isFinite(Number(requestedMs)) ? Number(requestedMs) : remaining;
    const maximum = Number.isFinite(Number(maximumMs)) ? Number(maximumMs) : remaining;
    return Math.max(0, Math.min(remaining, requested, maximum));
  };
  return {
    version: "transform_latency_budget_v1",
    started_at_ms: startedAt,
    deadline_at_ms: deadlineAt,
    reserve_ms: reserve,
    total_ms: total,
    remainingMs,
    canRun,
    providerTimeoutMs,
    snapshot(label = null) {
      return {
        version: "transform_latency_budget_v1",
        label,
        elapsed_ms: Math.max(0, now() - startedAt),
        remaining_ms: remainingMs(),
        total_ms: total,
        reserve_ms: reserve,
      };
    },
  };
}

export function shouldRunAccessoryEscalationV1(budget, minimumRemainingMs = 10000) {
  return Boolean(budget?.canRun?.(minimumRemainingMs));
}
