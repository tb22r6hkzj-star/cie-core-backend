import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../src/server.js", import.meta.url), "utf8");

test("transform route uses total latency budget and capped Pixelcut timeout", () => {
  assert.match(source, /createTransformLatencyBudgetV1\(\{/);
  assert.match(source, /VISIONCORE_TRANSFORM_BUDGET_MS/);
  assert.match(source, /const PIXELCUT_TIMEOUT_MS = 18000/);
  assert.match(source, /providerTimeoutMs\(\{ requestedMs: PIXELCUT_TIMEOUT_MS, maximumMs: 18000 \}\)/);
});

test("SAM starts in parallel with DINO", () => {
  assert.match(source, /const samPromise = runSamSegmentation\(ghostUrl\);/);
  assert.match(source, /const sam = await samPromise;/);
});

test("optional external intelligence and accessory escalation obey remaining budget", () => {
  assert.match(source, /ACCESSORY_REANALYSIS_BUDGET_MS - transformLatencyBudget\.reserve_ms/);
  assert.match(source, /EXTERNAL_SEMANTIC_OBSERVER_BUDGET_MS \+ accessoryReanalysisMinimumRemainingMs/);
  assert.match(source, /!transformLatencyBudget\.canRun\(externalObserverMinimumRemainingMs\)/);
  assert.match(source, /requestedMs: EXTERNAL_SEMANTIC_OBSERVER_BUDGET_MS/);
  assert.match(source, /shouldRunAccessoryEscalationV1\(transformLatencyBudget, accessoryReanalysisMinimumRemainingMs\)/);
  assert.match(source, /transform_latency_budget_insufficient_for_optional_accessory_reanalysis/);
});

test("local accessory color recovery takes priority over optional semantic observation", () => {
  assert.match(source, /preExternalAccessoryIntelligenceLane/);
  assert.match(source, /preExternalForcedAccessoryTargets/);
  assert.match(source, /accessoryRecoveryPrioritizedOverExternalObserver/);
  assert.match(source, /accessory_recovery_priority_v1/);
  assert.match(source, /response_reserve_counted_ms/);
});

test("response debug exposes transform latency budget snapshot", () => {
  assert.match(source, /transform_latency_budget_v1: transformLatencyBudget\.snapshot\("response"\)/);
});

// This file is intentionally part of the wiring workflow trigger set.
