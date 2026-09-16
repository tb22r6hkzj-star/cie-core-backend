import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../src/server.js", import.meta.url), "utf8");
const segmentationProviderSource = fs.readFileSync(
  new URL("../src/intelligence/external/segmentationProviderV1.js", import.meta.url),
  "utf8"
);

test("transform route uses total latency budget and capped Pixelcut timeout", () => {
  assert.match(source, /createTransformLatencyBudgetV1\(\{/);
  assert.match(source, /VISIONCORE_TRANSFORM_BUDGET_MS/);
  assert.match(source, /const PIXELCUT_TIMEOUT_MS = 18000/);
  assert.match(source, /providerTimeoutMs\(\{ requestedMs: PIXELCUT_TIMEOUT_MS, maximumMs: 18000 \}\)/);
});

test("semantic understanding starts early and target-conditioned masks follow localization", () => {
  assert.match(source, /const earlyExternalSemanticPromise = runOpenAISemanticObserverV1\(\{/);
  assert.match(source, /profile: "segmentation_scene"/);
  assert.match(source, /const earlyColorLightingPromise = runOpenAISemanticObserverV1/);
  assert.match(source, /profile: "color_lighting"/);
  assert.match(source, /const earlyColorSemantic = await earlyColorLightingPromise/);
  assert.match(source, /requestedMs: EARLY_SEMANTIC_OBSERVER_BUDGET_MS/);
  assert.match(source, /const detectorSegmentationPlan = buildTargetConditionedSegmentationPlanV1/);
  assert.match(source, /runTargetConditionedSegmentation\(targetSegmentationImageUrl, detectorSegmentationPlan/);
  assert.match(source, /semanticObservationPromise: earlyExternalSemanticPromise/);
  assert.match(source, /targetSegmentationImageUrl: publicUrl/);
  assert.match(source, /buildTargetConditionedSegmentationPlanV1\(\{/);
  assert.match(source, /runTargetConditionedSegmentation\(ghostUrl, segmentationPlan/);
  assert.doesNotMatch(source, /const samPromise = runSamSegmentation\(ghostUrl/);
});

test("semantic and detector work overlap while masks use the full-resolution original", () => {
  const semanticStart = source.indexOf("const earlyExternalSemanticPromise");
  const maskStart = source.indexOf("const detectorSegmentationPlan");
  const pixelcutStart = source.indexOf("ghostUrl = await callPixelcutRemoveBg", semanticStart);
  assert.ok(semanticStart > 0);
  assert.ok(pixelcutStart > semanticStart);
  assert.ok(maskStart > 0);
  assert.match(source, /targetSegmentationImageUrl: publicUrl/);
  assert.match(source, /VISIONCORE_EARLY_SEMANTIC_TIMEOUT_MS/);
  assert.match(source, /VISIONCORE_EARLY_TARGET_SEGMENTATION_TIMEOUT_MS/);
  assert.match(source, /early_target_conditioned_segmentation: !!earlyTargetSegmentation\?\.ok/);
});

test("upload time cannot consume the inference correction reserve", () => {
  const upload = source.indexOf("publicUrl = await uploadToCloudinary(file)");
  const budget = source.indexOf("const transformLatencyBudget = createTransformLatencyBudgetV1", upload);
  assert.ok(upload > 0);
  assert.ok(budget > upload);
});

test("target-conditioned masks stay color-neutral and publish only measured mask pixels", () => {
  const replicateTargetProvider = source.slice(
    source.indexOf("async function runReplicateTargetConditionedSamMask"),
    source.indexOf("async function runSamSegmentation")
  );
  assert.match(replicateTargetProvider, /mask_prompt: String\(target\?\.prompt/);
  assert.match(replicateTargetProvider, /const maskUrl = outputs\[2\]/);
  assert.match(replicateTargetProvider, /external_color_authority: false/);
  assert.match(segmentationProviderSource, /prompt: clean\(target\?\.prompt \|\| target\?\.label\)/);
  assert.match(segmentationProviderSource, /box_prompts: \[box\]/);
  assert.match(segmentationProviderSource, /apply_mask: false/);
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
  assert.match(source, /accessoryBudgetCanRun\(1500\)/);
  assert.match(source, /transformLatencyBudget\.canRunCorrection\(minimumMs\)/);
  assert.match(source, /transform_latency_budget_exhausted_before_accessory_reanalysis/);
  assert.match(source, /const targetedDetectorTimeoutMs = accessoryProviderTimeoutMs/);
  assert.match(source, /targetedAccessoryReanalysis\.query,[\s\S]*\{ timeoutMs: targetedDetectorTimeoutMs \}/);
  assert.match(source, /runGroundingDinoDetection\(cropArtifact\.url, microQuery, \{/);
  assert.match(source, /runSamSegmentation\(trueMicroCropArtifact\.url, \{[\s\S]*timeoutMs: accessoryProviderTimeoutMs/);
  assert.match(source, /transform_latency_budget_exhausted_before_micro_crop_detection/);
  assert.match(source, /transform_latency_budget_exhausted_before_micro_crop_segmentation/);
});

test("response debug exposes transform latency budget snapshot", () => {
  assert.match(source, /transform_latency_budget_v1: transformLatencyBudget\.snapshot\("response"\)/);
});

test("runtime contradiction recovery has a dedicated bounded budget", () => {
  assert.match(source, /VISIONCORE_SECOND_PASS_BUDGET_MS/);
  assert.match(source, /const secondPassBudgetMs = Math\.min\([\s\S]*RUNTIME_SECOND_PASS_BUDGET_MS,[\s\S]*transformLatencyBudget\.correctionRemainingMs\(\)/);
  assert.doesNotMatch(source, /secondPassBudgetMs = Math\.max\(0, Math\.min\(8000, transformLatencyBudget\.remainingMs\(\)\)\)/);
  assert.match(source, /VISIONCORE_CORRECTION_RESERVE_MS/);
  assert.match(source, /transformLatencyBudget\.correctionRemainingMs\(\)/);
  assert.match(source, /transformLatencyBudget\.correctionProviderTimeoutMs/);
  assert.match(source, /VISIONCORE_TRANSFORM_BUDGET_MS\) \|\| 70000/);
  assert.match(source, /VISIONCORE_CORRECTION_RESERVE_MS\) \|\| 30000/);
  assert.match(source, /secondPassFreshSegmentationPromise \|\|=/);
  assert.match(source, /const primaryCorrectionZones = new Set/);
  assert.match(source, /const seenRecoveryTargets = new Set/);
  assert.match(source, /maximumMs: 20000/);
  assert.match(source, /if \(forceFreshSegmentation\) candidates = \[\]/);
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
    source.slice(source.indexOf("async function runYoloWorldDetection"), source.indexOf("async function runReplicateSamSegmentation")),
    source.slice(source.indexOf("async function runReplicateSamSegmentation"), source.indexOf("async function runReplicateTargetConditionedSamMask")),
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
    source.indexOf("async function runReplicateSamSegmentation"),
    source.indexOf("async function runReplicateTargetConditionedSamMask")
  );
  assert.match(samProviderSource, /const requestStartedAt = Date\.now\(\);/);
  assert.doesNotMatch(samProviderSource, /Date\.now\(\) - startedAt/);
  assert.equal(
    (samProviderSource.match(/Date\.now\(\) - requestStartedAt/g) || []).length,
    2
  );
});
// This file is intentionally part of the wiring workflow trigger set.
