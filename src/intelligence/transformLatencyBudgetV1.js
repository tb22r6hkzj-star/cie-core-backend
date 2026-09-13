export function createTransformLatencyBudgetV1({ totalMs = 50000, reserveMs = 5000, correctionReserveMs = 12000, startedAt = Date.now() } = {}) {
  const total = Math.max(10000, Number(totalMs) || 50000);
  const reserve = Math.max(1000, Math.min(total - 1000, Number(reserveMs) || 5000));
  const correctionReserve = Math.max(0, Math.min(total - reserve - 1000, Number(correctionReserveMs) || 0));
  const deadlineAt = startedAt + total;
  const correctionDeadlineAt = deadlineAt - reserve;
  const usableDeadlineAt = correctionDeadlineAt - correctionReserve;
  const now = () => Date.now();
  const remainingMs = () => Math.max(0, usableDeadlineAt - now());
  const correctionRemainingMs = () => Math.max(0, correctionDeadlineAt - now());
  const canRun = (minimumMs = 0) => remainingMs() >= Math.max(0, Number(minimumMs) || 0);
  const canRunCorrection = (minimumMs = 0) => correctionRemainingMs() >= Math.max(0, Number(minimumMs) || 0);
  const providerTimeoutMs = ({ requestedMs, minimumMs = 1500, maximumMs = Infinity } = {}) => {
    const remaining = remainingMs();
    const requested = Number.isFinite(Number(requestedMs)) ? Number(requestedMs) : remaining;
    const maximum = Number.isFinite(Number(maximumMs)) ? Number(maximumMs) : remaining;
    return Math.max(0, Math.min(remaining, requested, maximum));
  };
  const correctionProviderTimeoutMs = ({ requestedMs, minimumMs = 1500, maximumMs = Infinity } = {}) => {
    const remaining = correctionRemainingMs();
    const requested = Number.isFinite(Number(requestedMs)) ? Number(requestedMs) : remaining;
    const maximum = Number.isFinite(Number(maximumMs)) ? Number(maximumMs) : remaining;
    return remaining < Math.max(0, Number(minimumMs) || 0) ? 0 : Math.max(0, Math.min(remaining, requested, maximum));
  };
  return {
    version: "transform_latency_budget_v1",
    started_at_ms: startedAt,
    deadline_at_ms: deadlineAt,
    reserve_ms: reserve,
    correction_reserve_ms: correctionReserve,
    total_ms: total,
    remainingMs,
    correctionRemainingMs,
    canRun,
    canRunCorrection,
    providerTimeoutMs,
    correctionProviderTimeoutMs,
    snapshot(label = null) {
      return {
        version: "transform_latency_budget_v1",
        label,
        elapsed_ms: Math.max(0, now() - startedAt),
        remaining_ms: remainingMs(),
        correction_remaining_ms: correctionRemainingMs(),
        total_ms: total,
        reserve_ms: reserve,
        correction_reserve_ms: correctionReserve,
      };
    },
  };
}

export function shouldRunAccessoryEscalationV1(budget, minimumRemainingMs = 10000) {
  return Boolean(budget?.canRun?.(minimumRemainingMs));
}
