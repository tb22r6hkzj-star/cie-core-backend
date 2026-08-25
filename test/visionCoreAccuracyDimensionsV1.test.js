import test from "node:test";
import assert from "node:assert/strict";
import { evaluateQualityGates, evaluateSample, normalizeBenchmarkSample } from "../src/evaluation/index.js";

test("accuracy is reported separately for identity, ownership, color, pattern, and multicolor", () => {
  const sample = normalizeBenchmarkSample({
    image_id: "reference",
    expected_objects: ["upper_garment", "lower_garment"],
    expected_zone_labels: { upper_garment: "shirt", lower_garment: "trousers" },
    expected_color_mode_by_zone: { upper_garment: "single_color", lower_garment: "single_color" },
    expected_pattern_by_zone: { upper_garment: "solid", lower_garment: "solid" },
    expected_primary_color_by_zone: { upper_garment: "#935234", lower_garment: "#3F5041" },
  });
  const result = {
    garment_zones: { zones: {
      upper_garment: { garment_type: "shirt", color_mode: "single_color", pattern: "solid", primary_color: { hex: "#935234" } },
      lower_garment: { garment_type: "trousers", color_mode: "single_color", pattern: "solid", primary_color: { hex: "#3F5041" } },
    } },
  };
  const row = evaluateSample(sample, result);
  assert.equal(row.garment_identity_accuracy, 1);
  assert.equal(row.ownership_accuracy, 1);
  assert.equal(row.multicolor_accuracy, 1);
  assert.equal(row.pattern_accuracy, 1);
  assert.equal(row.zone_color_fidelity, 1);
});

test("metric floors fail a release even when blended reliability could hide the weakness", () => {
  const gate = evaluateQualityGates({ scorecard: { overall_reliability: 0.95, multicolor_accuracy: 0.7 } }, {
    min_overall_reliability: 0.9,
    metric_floors: { multicolor_accuracy: 0.95 },
  });
  assert.equal(gate.passed, false);
  assert.deepEqual(gate.failures, [{ gate: "multicolor_accuracy", actual: 0.7, threshold: 0.95 }]);
});

test("benchmark annotations expose collection and adjudication state", () => {
  const sample = normalizeBenchmarkSample({ image_id: "planned", annotation_status: "adjudicated", annotator_count: 2, benchmark_axes: ["pattern"] });
  assert.equal(sample.annotation_status, "adjudicated");
  assert.equal(sample.annotator_count, 2);
  assert.deepEqual(sample.benchmark_axes, ["pattern"]);
});
