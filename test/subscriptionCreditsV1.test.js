import test from "node:test";
import assert from "node:assert/strict";
import {
  VISIONCORE_PLANS_V2,
  activatePrepaidCycleV1,
  reserveAnalysisCreditV1,
  resolveVisionCorePlanIdV2,
  settleAnalysisCreditV1,
} from "../src/product/subscriptionCreditsV1.js";

test("monthly credits are issued only after prepaid payment", () => {
  assert.throws(() => activatePrepaidCycleV1({}, { planId: "essential", paid: false }), /prepaid payment/);
  const account = activatePrepaidCycleV1({}, { planId: "essential", paid: true, cycleId: "cycle-1" });
  assert.equal(account.credits_remaining, 20);
});

test("limited rollover cannot exceed one plan allowance", () => {
  const account = activatePrepaidCycleV1({ credits_remaining: 999 }, { planId: "plus", paid: true, cycleId: "cycle-2" });
  assert.equal(account.credits_issued, 50);
  assert.equal(account.credits_carried, 50);
  assert.equal(account.credits_remaining, 100);
});

test("only a successful completed analysis consumes a credit", () => {
  let account = activatePrepaidCycleV1({}, { planId: "essential", paid: true, cycleId: "cycle-1" });
  account = reserveAnalysisCreditV1(account, { requestId: "failed" }).account;
  const failed = settleAnalysisCreditV1(account, { requestId: "failed", succeeded: false });
  assert.equal(failed.charged, false);
  assert.equal(failed.account.credits_remaining, 20);

  account = reserveAnalysisCreditV1(failed.account, { requestId: "success" }).account;
  const success = settleAnalysisCreditV1(account, { requestId: "success", succeeded: true });
  assert.equal(success.charged, true);
  assert.equal(success.account.credits_remaining, 19);
});

test("idempotent settlement cannot double-charge retries", () => {
  let account = activatePrepaidCycleV1({}, { planId: "pro", paid: true, cycleId: "cycle-1" });
  account = reserveAnalysisCreditV1(account, { requestId: "same-request" }).account;
  const first = settleAnalysisCreditV1(account, { requestId: "same-request", succeeded: true });
  const retry = settleAnalysisCreditV1(first.account, { requestId: "same-request", succeeded: true });
  assert.equal(first.account.credits_remaining, 99);
  assert.equal(retry.account.credits_remaining, 99);
  assert.equal(retry.idempotent, true);
});

test("dual-lane catalog preserves approved prices and run allowances", () => {
  const expected = {
    individual_essential: [7.99, 20],
    individual_plus: [14.99, 50],
    individual_premium: [24.99, 100],
    professional_starter: [19, 30],
    professional_business: [49, 100],
    professional_growth: [79, 250],
    professional_studio: [129, 500],
  };

  for (const [planId, [price, runs]] of Object.entries(expected)) {
    assert.equal(VISIONCORE_PLANS_V2[planId].price_usd, price);
    assert.equal(VISIONCORE_PLANS_V2[planId].monthly_analyses, runs);
  }
  assert.equal(VISIONCORE_PLANS_V2.enterprise.requires_contract, true);
});

test("legacy consumer plan IDs remain backward compatible", () => {
  assert.equal(resolveVisionCorePlanIdV2("essential"), "individual_essential");
  assert.equal(resolveVisionCorePlanIdV2("plus"), "individual_plus");
  assert.equal(resolveVisionCorePlanIdV2("pro"), "individual_premium");

  const account = activatePrepaidCycleV1({}, { planId: "pro", paid: true, cycleId: "legacy-pro" });
  assert.equal(account.plan_id, "pro");
  assert.equal(account.canonical_plan_id, "individual_premium");
  assert.equal(account.customer_segment, "individual");
  assert.equal(account.credits_remaining, 100);
});

test("professional aliases resolve to namespaced canonical plans", () => {
  const expected = {
    starter: "professional_starter",
    business: "professional_business",
    growth: "professional_growth",
    studio: "professional_studio",
    pro_studio: "professional_studio",
  };
  for (const [alias, canonical] of Object.entries(expected)) {
    assert.equal(resolveVisionCorePlanIdV2(alias), canonical);
  }

  const account = activatePrepaidCycleV1(
    { archive_limit: 9000 },
    { planId: "professional_growth", paid: true, cycleId: "growth-cycle" },
  );
  assert.equal(account.credits_remaining, 250);
  assert.equal(account.archive_limit, 9000);
  assert.equal(account.customer_segment, "professional");
});

test("ambiguous pro requires professional context for the Studio tier", () => {
  assert.equal(resolveVisionCorePlanIdV2("pro"), "individual_premium");
  assert.equal(
    resolveVisionCorePlanIdV2("pro", { customerSegment: "professional" }),
    "professional_studio",
  );

  const account = activatePrepaidCycleV1(
    {},
    { planId: "pro", customerSegment: "professional", paid: true, cycleId: "studio-cycle" },
  );
  assert.equal(account.canonical_plan_id, "professional_studio");
  assert.equal(account.credits_remaining, 500);
});

test("enterprise cannot activate without its contracted allowance", () => {
  assert.throws(
    () => activatePrepaidCycleV1({}, { planId: "enterprise", paid: true, cycleId: "enterprise-cycle" }),
    /contracted allowance/,
  );
});
