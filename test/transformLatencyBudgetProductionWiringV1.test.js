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
  assert.match(source, /requestedMs: 30000, maximumMs: 30000/);
  assert.match(source, /const samPromise = runSamSegmentation\(ghostUrl, \{ timeoutMs: primarySamTimeoutMs \}\);/);
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
  assert.match(source, /localAccessoryRecoveryRequired/);
  assert.match(source, /accessoryRecoveryPrioritizedOverExternalObserver/);
  assert.match(source, /accessory_recovery_priority_v1/);
  assert.match(source, /required_by_local_color_challenge/);
  assert.match(source, /response_reserve_counted_ms/);
});

test("required local accessory recovery is not suppressed by the optional-work latency gate", () => {
  assert.match(source, /!localAccessoryRecoveryRequired &&\s*!shouldRunAccessoryEscalationV1/);
});

test("targeted accessory recovery cannot outlive the transform budget", () => {
  assert.match(source, /!transformLatencyBudget\.canRun\(1500\)/);
  assert.match(source, /transform_latency_budget_exhausted_before_accessory_reanalysis/);
  assert.match(source, /const targetedDetectorTimeoutMs = transformLatencyBudget\.providerTimeoutMs/);
  assert.match(source, /targetedAccessoryReanalysis\.query,[\s\S]*\{ timeoutMs: targetedDetectorTimeoutMs \}/);
  assert.match(source, /runGroundingDinoDetection\(cropArtifact\.url, microQuery, \{/);
  assert.match(source, /runSamSegmentation\(trueMicroCropArtifact\.url, \{[\s\S]*providerTimeoutMs/);
  assert.match(source, /transform_latency_budget_exhausted_before_micro_crop_detection/);
  assert.match(source, /transform_latency_budget_exhausted_before_micro_crop_segmentation/);
});

test("response debug exposes transform latency budget snapshot", () => {
  assert.match(source, /transform_latency_budget_v1: transformLatencyBudget\.snapshot\("response"\)/);
});

test("primary DINO and one YOLO zero-result fallback share the transform budget", () => {
  assert.match(source, /analyzeGhostColors\(ghostUrl, \{ latencyBudget: transformLatencyBudget \}\)/);
  assert.match(source, /requestedMs: 18000, maximumMs: 18000/);
  assert.match(source, /!dinoDetections\.length && latencyBudget\?\.canRun\?\.\(8000\)/);
  assert.match(source, /requestedMs: 12000, maximumMs: 12000/);
  assert.match(source, /runYoloWorldDetection\(ghostUrl, DEFAULT_GROUNDING_DINO_QUERY/);
  assert.match(source, /detector_fallback_provider: fallbackProvider/);
  assert.match(source, /dino_recovery_attempted: recoveryAttempted/);
});

test("Replicate provider deadlines include prediction creation and polling", () => {
  const providerFunctions = [
    source.slice(source.indexOf("async function runGroundingDinoDetection"), source.indexOf("async function runYoloWorldDetection")),
    source.slice(source.indexOf("async function runYoloWorldDetection"), source.indexOf("async function runSamSegmentation")),
    source.slice(source.indexOf("async function runSamSegmentation"), source.indexOf("function normalizeSamOutput")),
  ];
  for (const providerSource of providerFunctions) {
    assert.match(providerSource, /const requestStartedAt = Date\.now\(\);/);
    assert.match(providerSource, /const deadlineAt = requestStartedAt \+ (?:bounded|effective)TimeoutMs;/);
    assert.match(providerSource, /while \(Date\.now\(\) < deadlineAt\)/);
    assert.match(providerSource, /Math\.max\(1, deadlineAt - Date\.now\(\)\)/);
  }
});

// This file is intentionally part of the wiring workflow trigger set.
