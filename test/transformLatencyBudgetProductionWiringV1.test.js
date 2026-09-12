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

test("semantic understanding starts early and target-conditioned masks follow localization", () => {
  assert.match(source, /const earlyExternalSemanticPromise = runOpenAISemanticObserverV1\(\{/);
  assert.match(source, /profile: "full"/);
  assert.match(source, /visioncore_semantic_intrinsic_remeasurement_v1/);
  assert.match(source, /timeoutMs: EARLY_SEMANTIC_OBSERVER_BUDGET_MS/);
  assert.match(source, /const earlyTargetSegmentationPromise = earlyExternalSemanticPromise\.then/);
  assert.match(source, /runTargetConditionedSegmentation\(publicUrl, earlyPlan/);
  assert.match(source, /semanticObservationPromise: earlyExternalSemanticPromise/);
  assert.match(source, /targetSegmentationPromise: earlyTargetSegmentationPromise/);
  assert.match(source, /buildTargetConditionedSegmentationPlanV1\(\{/);
  assert.match(source, /runTargetConditionedSegmentation\(ghostUrl, segmentationPlan/);
  assert.doesNotMatch(source, /const samPromise = runSamSegmentation\(ghostUrl/);
});

test("semantic masks run against the full-resolution original while legacy work continues", () => {
  const semanticStart = source.indexOf("const earlyExternalSemanticPromise");
  const maskStart = source.indexOf("const earlyTargetSegmentationPromise");
  const pixelcutStart = source.indexOf("ghostUrl = await callPixelcutRemoveBg", semanticStart);
  assert.ok(semanticStart > 0);
  assert.ok(maskStart > semanticStart);
  assert.ok(pixelcutStart > maskStart);
  assert.match(source, /VISIONCORE_EARLY_SEMANTIC_TIMEOUT_MS/);
  assert.match(source, /VISIONCORE_EARLY_TARGET_SEGMENTATION_TIMEOUT_MS/);
  assert.match(source, /early_target_conditioned_segmentation: !!earlyTargetSegmentation\?\.ok/);
});

test("target-conditioned masks stay color-neutral and publish only measured mask pixels", () => {
  const targetProvider = source.slice(
    source.indexOf("async function runTargetConditionedSamMask"),
    source.indexOf("async function runTargetConditionedSegmentation")
  );
  assert.match(targetProvider, /mask_prompt: String\(target\?\.prompt/);
  assert.match(targetProvider, /const maskUrl = outputs\[2\]/);
  assert.match(targetProvider, /external_color_authority: false/);
  assert.match(source, /pixel_count: row\.count/);
  assert.match(source, /measured_pixel_count: totalOwnedPixelCount/);
  assert.match(source, /validateTargetConditionedMaskMeasurementsV1/);
  assert.match(source, /enrichSamRegionsWithMaskedColors\(sam\?\.measurement_image_url \|\| ghostUrl, spatialValidation\.regions\)/);
  assert.match(source, /authority: "exclusive_mask_pixel_membership"/);
  assert.match(source, /transform_latency_budget_exhausted_before_target_segmentation/);
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

test("primary DINO and split YOLO zero-result fallback lanes share the transform budget", () => {
  assert.match(source, /analyzeGhostColors\(ghostUrl, \{[\s\S]*?latencyBudget: transformLatencyBudget,[\s\S]*?semanticObservationPromise: earlyExternalSemanticPromise/);
  assert.match(source, /requestedMs: 18000, maximumMs: 18000/);
  assert.match(source, /!dinoDetections\.length && latencyBudget\?\.canRun\?\.\(8000\)/);
  assert.match(source, /requestedMs: 12000, maximumMs: 12000/);
  assert.match(source, /runYoloWorldDetection\(ghostUrl, DEFAULT_GROUNDING_DINO_GARMENT_QUERY/);
  assert.match(source, /runYoloWorldDetection\(ghostUrl, DEFAULT_GROUNDING_DINO_ACCESSORY_QUERY/);
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


test("SAM lifecycle telemetry uses its declared request clock", () => {
  const samProviderSource = source.slice(
    source.indexOf("async function runSamSegmentation"),
    source.indexOf("async function runTargetConditionedSamMask")
  );
  assert.match(samProviderSource, /const requestStartedAt = Date\.now\(\);/);
  assert.doesNotMatch(samProviderSource, /Date\.now\(\) - startedAt/);
  assert.equal(
    (samProviderSource.match(/Date\.now\(\) - requestStartedAt/g) || []).length,
    2
  );
});
// This file is intentionally part of the wiring workflow trigger set.
