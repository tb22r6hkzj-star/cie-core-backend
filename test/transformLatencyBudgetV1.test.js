import test from "node:test";
import assert from "node:assert/strict";
import { createTransformLatencyBudgetV1, shouldRunAccessoryEscalationV1 } from "../src/intelligence/transformLatencyBudgetV1.js";

test("transform latency budget preserves response reserve", () => {
  const startedAt = Date.now() - 1000;
  const budget = createTransformLatencyBudgetV1({ totalMs: 50000, reserveMs: 5000, startedAt });
  const remaining = budget.remainingMs();
  assert.ok(remaining <= 44050 && remaining >= 43800);
  assert.equal(budget.snapshot("test").total_ms, 50000);
  assert.equal(budget.snapshot("test").reserve_ms, 5000);
});

test("provider timeout can never exceed remaining transform budget", () => {
  const startedAt = Date.now() - 43000;
  const budget = createTransformLatencyBudgetV1({ totalMs: 50000, reserveMs: 5000, startedAt });
  const timeout = budget.providerTimeoutMs({ requestedMs: 30000, maximumMs: 18000 });
  assert.ok(timeout <= 2100);
});

test("accessory escalation is skipped when transform budget is nearly exhausted", () => {
  const startedAt = Date.now() - 39000;
  const budget = createTransformLatencyBudgetV1({ totalMs: 50000, reserveMs: 5000, startedAt });
  assert.equal(shouldRunAccessoryEscalationV1(budget, 10000), false);
});
