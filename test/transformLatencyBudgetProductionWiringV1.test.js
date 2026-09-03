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
  assert.match(source, /!transformLatencyBudget\.canRun\(8000\)/);
  assert.match(source, /timeoutMs: transformLatencyBudget\.providerTimeoutMs\(\{ requestedMs: 8000, maximumMs: 8000 \}\)/);
  assert.match(source, /shouldRunAccessoryEscalationV1\(transformLatencyBudget, 10000\)/);
  assert.match(source, /transform_latency_budget_insufficient_for_optional_accessory_reanalysis/);
});

test("response debug exposes transform latency budget snapshot", () => {
  assert.match(source, /transform_latency_budget_v1: transformLatencyBudget\.snapshot\("response"\)/);
});
