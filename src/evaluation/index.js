import {
  createBenchmarkDataset,
  loadBenchmarkDataset,
  normalizeBenchmarkSample,
  VEF_BENCHMARK_SCHEMA_VERSION,
} from "./benchmarkDataset.js";
import {
  brierScore,
  colorAccuracy,
  confidenceBins,
  confidenceError,
  expectedCalibrationError,
  labColorDistance,
  maximumCalibrationError,
  objectPrecisionRecall,
} from "./metrics.js";

export {
  createBenchmarkDataset,
  loadBenchmarkDataset,
  normalizeBenchmarkSample,
  VEF_BENCHMARK_SCHEMA_VERSION,
  brierScore,
  colorAccuracy,
  confidenceBins,
  confidenceError,
  expectedCalibrationError,
  labColorDistance,
  maximumCalibrationError,
  objectPrecisionRecall,
};

function clamp01(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
}

function mean(values = []) {
  const rows = values.filter(Number.isFinite);
  return rows.length ? rows.reduce((sum, value) => sum + value, 0) / rows.length : 0;
}

function normalizedConfidence(value) {
  const n = Number(value || 0);
  return clamp01(n > 1 ? n / 100 : n);
}

function extractZones(result = {}) {
  return result?.garment_zones?.zones || result?.zones || {};
}

function extractPredictedObjects(result = {}) {
  if (Array.isArray(result?.objects)) return result.objects.map((item) => String(item?.type || item?.label || item)).filter(Boolean);
  return Object.entries(extractZones(result))
    .filter(([, zone]) => zone && zone.publication_state !== "rejected" && (zone.hex || zone.primary_color?.hex || zone.dominant_color?.hex))
    .map(([key]) => key);
}

function extractPredictedColors(result = {}) {
  const colors = [];
  for (const zone of Object.values(extractZones(result))) {
    if (!zone) continue;
    const candidates = [zone.primary_color, zone.dominant_color, ...(zone.secondary_colors || []), ...(zone.accent_colors || [])];
    for (const color of candidates) if (color?.hex) colors.push(color);
    if (!candidates.some((color) => color?.hex) && zone.hex) colors.push({ hex: zone.hex });
  }
  return colors;
}

function extractDominantColor(result = {}) {
  const zones = Object.values(extractZones(result));
  for (const zone of zones) {
    const hex = zone?.primary_color?.hex || zone?.dominant_color?.hex || zone?.hex;
    if (hex) return hex;
  }
  return null;
}

function extractPublicationStates(result = {}) {
  return Object.values(extractZones(result)).map((zone) => zone?.publication_state).filter(Boolean);
}

function extractConfidence(result = {}) {
  const values = Object.values(extractZones(result))
    .map((zone) => zone?.unified_confidence ?? zone?.calibrated_confidence ?? zone?.confidence)
    .filter((value) => Number.isFinite(Number(value)));
  return values.length ? mean(values.map(normalizedConfidence)) : normalizedConfidence(result?.confidence);
}

function extractEvidenceChain(result = {}) {
  const zone = Object.values(extractZones(result)).find((candidate) => Array.isArray(candidate?.evidence_chain));
  return zone?.evidence_chain || [];
}

function buildDebugArtifacts(result = {}) {
  const zones = extractZones(result);
  return {
    candidate_rankings: result?.candidate_rankings || result?.perception_v6?.zone_reconciliation || [],
    evidence_chain: Object.fromEntries(Object.entries(zones).map(([key, zone]) => [key, zone?.evidence_chain || []])),
    confidence_model: Object.fromEntries(Object.entries(zones).map(([key, zone]) => [key, {
      raw_confidence: zone?.raw_confidence ?? null,
      calibrated_confidence: zone?.calibrated_confidence ?? null,
      unified_confidence: zone?.unified_confidence ?? null,
      confidence_inputs: zone?.confidence_inputs || null,
      confidence_weights: zone?.confidence_weights || null,
    }])),
    publication_reasoning: Object.fromEntries(Object.entries(zones).map(([key, zone]) => [key, {
      publication_state: zone?.publication_state || null,
      publication_reason: zone?.publication_reason || null,
      publication_reasons: zone?.publication_reasons || null,
    }])),
    color_hierarchy: Object.fromEntries(Object.entries(zones).map(([key, zone]) => [key, {
      dominant: zone?.primary_color || zone?.dominant_color || null,
      secondary: zone?.secondary_colors || zone?.support_colors || [],
      accent: zone?.accent_colors || [],
    }])),
    decision_metrics: Object.fromEntries(Object.entries(zones).map(([key, zone]) => [key, zone?.decision_metrics || null])),
  };
}

export function evaluateSample(sample, result, profile = {}) {
  const predictedObjects = extractPredictedObjects(result);
  const predictedColors = extractPredictedColors(result);
  const objectMetrics = objectPrecisionRecall(sample.expected_objects, predictedObjects);
  const dominantExpected = sample.expected_dominant_color?.hex || sample.expected_dominant_color || null;
  const dominantPredicted = extractDominantColor(result);
  const dominantDistance = dominantExpected && dominantPredicted ? labColorDistance(dominantExpected, dominantPredicted) : null;
  const colorAcc = colorAccuracy(sample.expected_colors, predictedColors);
  const confidence = extractConfidence(result);
  const confidenceErr = confidenceError(confidence, sample.expected_confidence_range);
  const states = extractPublicationStates(result);
  const expectedState = sample.expected_publication_state;
  const publicationMatch = expectedState ? (states.includes(expectedState) ? 1 : 0) : 1;
  const actualEvidence = extractEvidenceChain(result).map((row) => row?.stage || row).filter(Boolean);
  const expectedEvidence = sample.expected_evidence_chain || [];
  const evidenceQuality = expectedEvidence.length
    ? expectedEvidence.filter((stage) => actualEvidence.includes(stage)).length / expectedEvidence.length
    : 1;

  return {
    image_id: sample.image_id,
    object_precision: objectMetrics.precision,
    object_recall: objectMetrics.recall,
    lab_color_distance: dominantDistance,
    color_accuracy: colorAcc,
    confidence,
    confidence_error: confidenceErr,
    publication_match: publicationMatch,
    evidence_quality: evidenceQuality,
    decision_consistency: Object.values(extractZones(result)).every((zone) => zone?.decision_consistency?.valid !== false) ? 1 : 0,
    inference_time_ms: Number(profile?.total_inference_time_ms || 0),
    debug_artifacts: buildDebugArtifacts(result),
  };
}

function buildCalibration(perImage = []) {
  const rows = perImage.map((row) => ({ confidence: row.confidence, accuracy: mean([row.object_precision, row.object_recall, row.color_accuracy, row.publication_match]) }));
  return {
    bins: confidenceBins(rows),
    expected_calibration_error: expectedCalibrationError(rows),
    maximum_calibration_error: maximumCalibrationError(rows),
    brier_score: brierScore(rows),
  };
}

export function buildScorecard(perImage = []) {
  const perceptionAccuracy = mean(perImage.map((row) => mean([row.object_precision, row.object_recall])));
  const publicationPrecision = mean(perImage.map((row) => row.publication_match));
  const colorFidelity = mean(perImage.map((row) => row.color_accuracy));
  const evidenceQuality = mean(perImage.map((row) => row.evidence_quality));
  const consistency = mean(perImage.map((row) => row.decision_consistency));
  const explainability = mean(perImage.map((row) => row.debug_artifacts?.evidence_chain ? 1 : 0));
  const calibration = 1 - Math.min(1, buildCalibration(perImage).expected_calibration_error);
  const averageMs = mean(perImage.map((row) => row.inference_time_ms));
  const performance = averageMs > 0 ? 1 / (1 + averageMs / 1000) : 1;
  const overall = mean([perceptionAccuracy, publicationPrecision, colorFidelity, evidenceQuality, consistency, explainability, calibration, performance]);
  return {
    perception_accuracy: perceptionAccuracy,
    publication_precision: publicationPrecision,
    color_fidelity: colorFidelity,
    evidence_quality: evidenceQuality,
    consistency,
    explainability,
    calibration,
    performance,
    overall_reliability: overall,
  };
}

export function buildEngineHealthReport(perImage = [], { regression_count = 0 } = {}) {
  const scorecard = buildScorecard(perImage);
  const confidences = perImage.map((row) => row.confidence);
  const confidenceStability = confidences.length < 2 ? 1 : Math.max(0, 1 - Math.sqrt(mean(confidences.map((value) => (value - mean(confidences)) ** 2))));
  return {
    overall_engine_health: scorecard.overall_reliability,
    confidence_stability: confidenceStability,
    regression_count: Number(regression_count || 0),
    publication_success_rate: scorecard.publication_precision,
    color_fidelity: scorecard.color_fidelity,
    decision_reliability: scorecard.consistency,
    average_inference_time_ms: mean(perImage.map((row) => row.inference_time_ms)),
    calibration_readiness: perImage.length > 0 && perImage.every((row) => Number.isFinite(row.confidence)) ? 1 : 0,
  };
}

export function profilePerformance({ started_at_ms, ended_at_ms, result } = {}) {
  const start = Number(started_at_ms || 0);
  const end = Number(ended_at_ms || start);
  const profile = result?.performance_profile || {};
  return {
    total_inference_time_ms: Math.max(0, end - start),
    color_clustering_time_ms: Number(profile.color_clustering_time_ms || 0),
    zone_reasoning_time_ms: Number(profile.zone_reasoning_time_ms || 0),
    publication_reasoning_time_ms: Number(profile.publication_reasoning_time_ms || 0),
    evidence_generation_time_ms: Number(profile.evidence_generation_time_ms || 0),
    memory_usage_bytes: Number(profile.memory_usage_bytes || 0),
  };
}

export async function runEvaluation(datasetOrOptions, maybeOptions = {}) {
  const options = datasetOrOptions?.dataset ? datasetOrOptions : { ...maybeOptions, dataset: datasetOrOptions };
  const dataset = loadBenchmarkDataset(options.dataset);
  const infer = options.infer || options.inference;
  if (typeof infer !== "function") throw new Error("VEF runEvaluation requires an injected inference callback");

  const perImage = [];
  for (const sample of dataset.samples) {
    const started = Date.now();
    const result = await infer(sample);
    const ended = Date.now();
    const profile = profilePerformance({ started_at_ms: started, ended_at_ms: ended, result });
    perImage.push({ ...evaluateSample(sample, result, profile), profile });
  }
  const calibration = buildCalibration(perImage);
  const scorecard = buildScorecard(perImage);
  const health = buildEngineHealthReport(perImage);
  return {
    schema_version: "vef_evaluation_report_v1",
    dataset_id: dataset.dataset_id,
    sample_count: perImage.length,
    per_image: perImage,
    calibration,
    scorecard,
    engine_health: health,
    performance: {
      average_inference_time_ms: health.average_inference_time_ms,
      total_inference_time_ms: perImage.reduce((sum, row) => sum + row.inference_time_ms, 0),
    },
  };
}

export function compareEvaluationReports(current = {}, baseline = {}) {
  const currentRows = new Map((current?.per_image || []).map((row) => [row.image_id, row]));
  const baselineRows = new Map((baseline?.per_image || []).map((row) => [row.image_id, row]));
  const decisionDrift = [];
  for (const [imageId, currentRow] of currentRows) {
    const baselineRow = baselineRows.get(imageId);
    if (!baselineRow) continue;
    decisionDrift.push({
      image_id: imageId,
      baseline: baselineRow,
      current: currentRow,
      confidence_drift: currentRow.confidence - baselineRow.confidence,
      color_drift: currentRow.color_accuracy - baselineRow.color_accuracy,
      publication_drift: currentRow.publication_match - baselineRow.publication_match,
      decision_drift: currentRow.decision_consistency - baselineRow.decision_consistency,
      performance_drift_ms: currentRow.inference_time_ms - baselineRow.inference_time_ms,
    });
  }
  return {
    regression_count: decisionDrift.filter((row) => row.color_drift < 0 || row.publication_drift < 0 || row.decision_drift < 0).length,
    confidence_drift: mean(decisionDrift.map((row) => row.confidence_drift)),
    color_drift: mean(decisionDrift.map((row) => row.color_drift)),
    publication_drift: mean(decisionDrift.map((row) => row.publication_drift)),
    decision_drift: mean(decisionDrift.map((row) => row.decision_drift)),
    performance_drift_ms: mean(decisionDrift.map((row) => row.performance_drift_ms)),
    decision_drift_records: decisionDrift,
  };
}

export function evaluateQualityGates(report = {}, config = {}) {
  const failures = [];
  const maxRegressions = Number(config.max_regressions ?? 0);
  const maxAverageMs = Number(config.max_average_inference_time_ms ?? Infinity);
  const minReliability = Number(config.min_overall_reliability ?? 0);
  const regressionCount = Number(report?.engine_health?.regression_count || report?.regression_count || 0);
  const averageMs = Number(report?.engine_health?.average_inference_time_ms || report?.performance?.average_inference_time_ms || 0);
  const reliability = Number(report?.scorecard?.overall_reliability || 0);
  if (regressionCount > maxRegressions) failures.push({ gate: "regression_count", actual: regressionCount, threshold: maxRegressions });
  if (averageMs > maxAverageMs) failures.push({ gate: "average_inference_time_ms", actual: averageMs, threshold: maxAverageMs });
  if (reliability < minReliability) failures.push({ gate: "overall_reliability", actual: reliability, threshold: minReliability });
  return { passed: failures.length === 0, failures };
}
