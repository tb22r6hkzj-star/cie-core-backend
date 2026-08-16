import test from "node:test";
import assert from "node:assert/strict";
import {
  VEF_BENCHMARK_SCHEMA_VERSION,
  brierScore,
  buildEngineHealthReport,
  buildScorecard,
  colorAccuracy,
  compareEvaluationReports,
  confidenceBins,
  confidenceError,
  createBenchmarkDataset,
  evaluateQualityGates,
  expectedCalibrationError,
  labColorDistance,
  loadBenchmarkDataset,
  maximumCalibrationError,
  normalizeBenchmarkSample,
  objectPrecisionRecall,
  profilePerformance,
  runEvaluation,
} from "../src/evaluation/index.js";

const sample = {
  image_id: "fixture-1",
  image_uri: "synthetic://fixture-1",
  expected_objects: ["eyewear"],
  expected_colors: ["#5A3522"],
  expected_publication_state: "confirmed",
  expected_confidence_range: [0.7, 1],
  expected_evidence_chain: ["detector", "publication_decision"],
  expected_dominant_color: "#5A3522",
  expected_secondary_colors: ["#111214"],
};

const inferenceResult = {
  garment_zones: {
    zones: {
      eyewear: {
        hex: "#5A3522",
        primary_color: { hex: "#5A3522" },
        secondary_colors: [{ hex: "#111214" }],
        unified_confidence: 88,
        publication_state: "confirmed",
        publication_reason: "object_local_color",
        publication_reasons: { primary: "object_local_color" },
        evidence_chain: [
          { stage: "detector" },
          { stage: "region_selection" },
          { stage: "pixel_refinement" },
          { stage: "geometry_validation" },
          { stage: "contamination_analysis" },
          { stage: "alternative_candidates" },
          { stage: "publication_decision" },
        ],
        decision_consistency: { valid: true, issues: [] },
        decision_metrics: { candidate_count: 2 },
        raw_confidence: 86,
        calibrated_confidence: 88,
        confidence_inputs: { object_evidence: 0.9 },
        confidence_weights: { object_evidence: 0.2 },
      },
    },
  },
  candidate_rankings: [{ zone: "eyewear", rank: 1 }],
};

function dataset(samples = [sample]) {
  return createBenchmarkDataset({ dataset_id: "vef-fixtures", samples });
}

// 1
test("VEF schema version is stable", () => {
  assert.equal(VEF_BENCHMARK_SCHEMA_VERSION, "vef_benchmark_v1");
});

// 2
test("normalizeBenchmarkSample requires image_id", () => {
  assert.throws(() => normalizeBenchmarkSample({}), /image_id/);
});

// 3
test("normalizeBenchmarkSample normalizes arrays and confidence defaults", () => {
  const row = normalizeBenchmarkSample({ image_id: "a", expected_objects: "eyewear" });
  assert.deepEqual(row.expected_objects, []);
  assert.deepEqual(row.expected_colors, []);
  assert.deepEqual(row.expected_confidence_range, [0, 1]);
  assert.equal(row.schema_version, "vef_benchmark_v1");
});

// 4
test("normalizeBenchmarkSample sorts reversed confidence range", () => {
  assert.deepEqual(normalizeBenchmarkSample({ image_id: "a", expected_confidence_range: [0.9, 0.2] }).expected_confidence_range, [0.2, 0.9]);
});

// 5
test("createBenchmarkDataset requires dataset_id", () => {
  assert.throws(() => createBenchmarkDataset({ samples: [] }), /dataset_id/);
});

// 6
test("createBenchmarkDataset records schema and normalizes samples", () => {
  const result = dataset();
  assert.equal(result.schema_version, "vef_benchmark_v1");
  assert.equal(result.dataset_id, "vef-fixtures");
  assert.equal(result.samples[0].image_id, "fixture-1");
});

// 7
test("loadBenchmarkDataset accepts JSON strings", () => {
  const result = loadBenchmarkDataset(JSON.stringify({ dataset_id: "json", samples: [{ image_id: "x" }] }));
  assert.equal(result.dataset_id, "json");
  assert.equal(result.samples.length, 1);
});

// 8
test("object precision and recall are correct", () => {
  const result = objectPrecisionRecall(["eyewear", "bag"], ["eyewear", "hat"]);
  assert.equal(result.precision, 0.5);
  assert.equal(result.recall, 0.5);
});

// 9
test("object precision and recall handle empty truth and prediction", () => {
  const result = objectPrecisionRecall([], []);
  assert.equal(result.precision, 1);
  assert.equal(result.recall, 1);
});

// 10
test("LAB color distance is zero for identical colors", () => {
  assert.equal(labColorDistance("#5A3522", "#5A3522"), 0);
});

// 11
test("LAB color distance separates distant colors", () => {
  assert.ok(labColorDistance("#000000", "#FFFFFF") > 90);
});

// 12
test("color accuracy matches near-identical expected colors", () => {
  assert.equal(colorAccuracy(["#5A3522"], ["#5B3623"]), 1);
});

// 13
test("color accuracy rejects distant colors at strict threshold", () => {
  assert.equal(colorAccuracy(["#FF0000"], ["#0000FF"], 10), 0);
});

// 14
test("confidence error is zero inside expected range", () => {
  assert.equal(confidenceError(0.8, [0.7, 0.9]), 0);
});

// 15
test("confidence error normalizes percentage confidence", () => {
  assert.ok(Math.abs(confidenceError(50, [0.7, 0.9]) - 0.2) < 1e-9);
});

// 16
test("confidence bins retain row counts", () => {
  const bins = confidenceBins([{ confidence: 0.2, accuracy: 1 }, { confidence: 0.8, accuracy: 1 }], 5);
  assert.equal(bins.reduce((sum, bin) => sum + bin.count, 0), 2);
});

// 17
test("expected calibration error is zero for calibrated rows", () => {
  assert.equal(expectedCalibrationError([{ confidence: 1, accuracy: 1 }, { confidence: 0, accuracy: 0 }]), 0);
});

// 18
test("maximum calibration error detects miscalibration", () => {
  assert.ok(maximumCalibrationError([{ confidence: 1, accuracy: 0 }]) > 0.9);
});

// 19
test("Brier score is zero for perfect predictions", () => {
  assert.equal(brierScore([{ confidence: 1, accuracy: 1 }, { confidence: 0, accuracy: 0 }]), 0);
});

// 20
test("performance profiler exposes recovered timing fields", () => {
  const result = profilePerformance({ started_at_ms: 10, ended_at_ms: 30, result: { performance_profile: { color_clustering_time_ms: 3, memory_usage_bytes: 128 } } });
  assert.equal(result.total_inference_time_ms, 20);
  assert.equal(result.color_clustering_time_ms, 3);
  assert.equal(result.memory_usage_bytes, 128);
  assert.ok("zone_reasoning_time_ms" in result);
  assert.ok("publication_reasoning_time_ms" in result);
  assert.ok("evidence_generation_time_ms" in result);
});

// 21
test("runEvaluation requires injected inference callback", async () => {
  await assert.rejects(() => runEvaluation(dataset()), /injected inference callback/);
});

// 22
test("runEvaluation emits per-image metrics and debug artifacts", async () => {
  const report = await runEvaluation({ dataset: dataset(), infer: async () => inferenceResult });
  assert.equal(report.sample_count, 1);
  assert.equal(report.per_image[0].object_precision, 1);
  assert.equal(report.per_image[0].object_recall, 1);
  assert.equal(report.per_image[0].color_accuracy, 1);
  assert.equal(report.per_image[0].publication_match, 1);
  const debug = report.per_image[0].debug_artifacts;
  assert.ok(Array.isArray(debug.candidate_rankings));
  assert.ok(debug.evidence_chain.eyewear);
  assert.equal(debug.confidence_model.eyewear.unified_confidence, 88);
  assert.equal(debug.publication_reasoning.eyewear.publication_state, "confirmed");
  assert.equal(debug.color_hierarchy.eyewear.dominant.hex, "#5A3522");
  assert.equal(debug.decision_metrics.eyewear.candidate_count, 2);
});

// 23
test("runEvaluation emits recovered scorecard and calibration fields", async () => {
  const report = await runEvaluation({ dataset: dataset(), infer: async () => inferenceResult });
  for (const key of ["perception_accuracy", "publication_precision", "color_fidelity", "evidence_quality", "consistency", "explainability", "calibration", "performance", "overall_reliability"]) {
    assert.ok(Number.isFinite(report.scorecard[key]), key);
  }
  assert.ok(Array.isArray(report.calibration.bins));
  assert.ok(Number.isFinite(report.calibration.expected_calibration_error));
  assert.ok(Number.isFinite(report.calibration.maximum_calibration_error));
  assert.ok(Number.isFinite(report.calibration.brier_score));
});

// 24
test("engine health report exposes recovered health fields", () => {
  const perImage = [{ confidence: 0.8, publication_match: 1, color_accuracy: 1, decision_consistency: 1, object_precision: 1, object_recall: 1, evidence_quality: 1, inference_time_ms: 10, debug_artifacts: { evidence_chain: {} } }];
  const health = buildEngineHealthReport(perImage, { regression_count: 2 });
  assert.equal(health.regression_count, 2);
  for (const key of ["overall_engine_health", "confidence_stability", "publication_success_rate", "color_fidelity", "decision_reliability", "average_inference_time_ms", "calibration_readiness"]) assert.ok(Number.isFinite(health[key]), key);
  assert.ok(Number.isFinite(buildScorecard(perImage).overall_reliability));
});

// 25
test("report comparison retains structured baseline/current drift records", () => {
  const baseline = { per_image: [{ image_id: "a", confidence: 0.9, color_accuracy: 1, publication_match: 1, decision_consistency: 1, inference_time_ms: 10 }] };
  const current = { per_image: [{ image_id: "a", confidence: 0.7, color_accuracy: 0.5, publication_match: 0, decision_consistency: 1, inference_time_ms: 20 }] };
  const drift = compareEvaluationReports(current, baseline);
  assert.equal(drift.regression_count, 1);
  assert.equal(drift.decision_drift_records.length, 1);
  assert.deepEqual(drift.decision_drift_records[0].baseline, baseline.per_image[0]);
  assert.deepEqual(drift.decision_drift_records[0].current, current.per_image[0]);
  assert.ok(drift.confidence_drift < 0);
  assert.ok(drift.color_drift < 0);
  assert.ok(drift.publication_drift < 0);
  assert.ok(drift.performance_drift_ms > 0);
});

// 26
test("quality gates fail configured regression, performance, and reliability thresholds", () => {
  const result = evaluateQualityGates({
    engine_health: { regression_count: 2, average_inference_time_ms: 500 },
    scorecard: { overall_reliability: 0.5 },
  }, {
    max_regressions: 0,
    max_average_inference_time_ms: 200,
    min_overall_reliability: 0.8,
  });
  assert.equal(result.passed, false);
  assert.deepEqual(result.failures.map((failure) => failure.gate), ["regression_count", "average_inference_time_ms", "overall_reliability"]);
});
