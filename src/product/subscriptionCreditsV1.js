export const VISIONCORE_PLANS_V1 = Object.freeze({
  essential: Object.freeze({ price_usd: 7.99, monthly_analyses: 20, archive_limit: 100 }),
  plus: Object.freeze({ price_usd: 14.99, monthly_analyses: 50, archive_limit: 500 }),
  pro: Object.freeze({ price_usd: 24.99, monthly_analyses: 100, archive_limit: 2000 }),
});

function planDefinition(planId) {
  const plan = VISIONCORE_PLANS_V1[String(planId || "").toLowerCase()];
  if (!plan) throw new Error("Unknown VisionCore plan");
  return plan;
}

export function activatePrepaidCycleV1(account = {}, { planId, paid = false, cycleId, startedAt, endsAt } = {}) {
  if (!paid) throw new Error("VisionCore credits require successful prepaid payment");
  const plan = planDefinition(planId);
  const carried = Math.min(plan.monthly_analyses, Math.max(0, Number(account?.credits_remaining || 0)));
  return {
    ...account,
    plan_id: String(planId).toLowerCase(),
    billing_cycle_id: String(cycleId || ""),
    billing_cycle_started_at: startedAt || null,
    billing_cycle_ends_at: endsAt || null,
    credits_issued: plan.monthly_analyses,
    credits_carried: carried,
    credits_remaining: plan.monthly_analyses + carried,
    archive_limit: plan.archive_limit,
    payment_state: "paid",
  };
}

export function reserveAnalysisCreditV1(account = {}, { requestId } = {}) {
  if (account?.payment_state !== "paid") return { allowed: false, reason: "subscription_not_paid", account };
  if (!requestId) return { allowed: false, reason: "request_id_required", account };
  const reservations = { ...(account?.credit_reservations || {}) };
  if (reservations[requestId]) return { allowed: true, idempotent: true, account };
  if (Number(account?.credits_remaining || 0) <= 0) return { allowed: false, reason: "no_credits_remaining", account };
  reservations[requestId] = { state: "reserved" };
  return { allowed: true, idempotent: false, account: { ...account, credit_reservations: reservations } };
}

export function settleAnalysisCreditV1(account = {}, { requestId, succeeded = false } = {}) {
  const reservations = { ...(account?.credit_reservations || {}) };
  const reservation = reservations[requestId];
  if (!reservation) return { charged: false, reason: "reservation_missing", account };
  if (reservation.state === "charged") return { charged: false, idempotent: true, reason: "already_charged", account };
  if (!succeeded) {
    delete reservations[requestId];
    return { charged: false, reason: "failed_analysis_not_charged", account: { ...account, credit_reservations: reservations } };
  }
  reservations[requestId] = { state: "charged" };
  return {
    charged: true,
    account: {
      ...account,
      credits_remaining: Math.max(0, Number(account?.credits_remaining || 0) - 1),
      credit_reservations: reservations,
    },
  };
}
