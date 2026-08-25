import test from "node:test";
import assert from "node:assert/strict";
import { activatePrepaidCycleV1, reserveAnalysisCreditV1, settleAnalysisCreditV1 } from "../src/product/subscriptionCreditsV1.js";

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
