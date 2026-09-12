export const VISIONCORE_PLANS_V1 = Object.freeze({
  essential: Object.freeze({ price_usd: 7.99, monthly_analyses: 20, archive_limit: 100 }),
  plus: Object.freeze({ price_usd: 14.99, monthly_analyses: 50, archive_limit: 500 }),
  pro: Object.freeze({ price_usd: 24.99, monthly_analyses: 100, archive_limit: 2000 }),
});

export const VISIONCORE_PLANS_V2 = Object.freeze({
  individual_essential: Object.freeze({
    customer_segment: "individual",
    display_name: "Essential",
    price_usd: 7.99,
    monthly_analyses: 20,
    archive_limit: 100,
  }),
  individual_plus: Object.freeze({
    customer_segment: "individual",
    display_name: "Plus",
    price_usd: 14.99,
    monthly_analyses: 50,
    archive_limit: 500,
  }),
  individual_premium: Object.freeze({
    customer_segment: "individual",
    display_name: "Premium",
    price_usd: 24.99,
    monthly_analyses: 100,
    archive_limit: 2000,
  }),
  professional_starter: Object.freeze({
    customer_segment: "professional",
    display_name: "Starter",
    price_usd: 19,
    monthly_analyses: 30,
  }),
  professional_business: Object.freeze({
    customer_segment: "professional",
    display_name: "Business",
    price_usd: 49,
    monthly_analyses: 100,
  }),
  professional_growth: Object.freeze({
    customer_segment: "professional",
    display_name: "Growth",
    price_usd: 79,
    monthly_analyses: 250,
  }),
  professional_studio: Object.freeze({
    customer_segment: "professional",
    display_name: "Studio",
    price_usd: 129,
    monthly_analyses: 500,
  }),
  enterprise: Object.freeze({
    customer_segment: "enterprise",
    display_name: "Enterprise",
    price_usd: null,
    monthly_analyses: null,
    requires_contract: true,
  }),
});

const PLAN_ALIASES_V2 = Object.freeze({
  essential: "individual_essential",
  plus: "individual_plus",
  premium: "individual_premium",
  starter: "professional_starter",
  business: "professional_business",
  growth: "professional_growth",
  studio: "professional_studio",
  pro_studio: "professional_studio",
});

export function resolveVisionCorePlanIdV2(planId, { customerSegment } = {}) {
  const normalized = String(planId || "").trim().toLowerCase();
  if (VISIONCORE_PLANS_V2[normalized]) return normalized;

  // `pro` shipped in V1 as the $24.99 individual plan, while the Famous
  // professional catalog also used `pro` for its $129 Studio tier. Preserve
  // V1 by default and require an explicit professional segment to disambiguate.
  if (normalized === "pro") {
    return String(customerSegment || "").toLowerCase() === "professional"
      ? "professional_studio"
      : "individual_premium";
  }

  return PLAN_ALIASES_V2[normalized] || null;
}

function planDefinition(planId, options) {
  const canonicalPlanId = resolveVisionCorePlanIdV2(planId, options);
  const plan = VISIONCORE_PLANS_V2[canonicalPlanId];
  if (!plan) throw new Error("Unknown VisionCore plan");
  if (plan.requires_contract) throw new Error("Enterprise plan requires a contracted allowance");
  return { canonicalPlanId, plan };
}

export function activatePrepaidCycleV1(
  account = {},
  { planId, customerSegment, paid = false, cycleId, startedAt, endsAt } = {},
) {
  if (!paid) throw new Error("VisionCore credits require successful prepaid payment");
  const { canonicalPlanId, plan } = planDefinition(planId, { customerSegment });
  const carried = Math.min(plan.monthly_analyses, Math.max(0, Number(account?.credits_remaining || 0)));
  const activated = {
    ...account,
    plan_id: String(planId).toLowerCase(),
    canonical_plan_id: canonicalPlanId,
    customer_segment: plan.customer_segment,
    plan_version: 2,
    billing_cycle_id: String(cycleId || ""),
    billing_cycle_started_at: startedAt || null,
    billing_cycle_ends_at: endsAt || null,
    credits_issued: plan.monthly_analyses,
    credits_carried: carried,
    credits_remaining: plan.monthly_analyses + carried,
    payment_state: "paid",
  };
  // Professional archive allowances are still governed by the Famous product
  // contract. Do not invent or erase them while the frontend is being migrated.
  if (Number.isFinite(plan.archive_limit)) activated.archive_limit = plan.archive_limit;
  return activated;
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
