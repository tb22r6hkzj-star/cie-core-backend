import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { evaluateBenchmarkReadinessV1 } from "../src/evaluation/benchmarkReadinessV1.js";

test("the current golden catalog honestly reports that validation is not complete", () => {
  const catalog = JSON.parse(fs.readFileSync(new URL("../evaluation/golden-benchmark-v1.json", import.meta.url), "utf8"));
  const result = evaluateBenchmarkReadinessV1(catalog);
  assert.equal(result.ready, false);
  assert.equal(result.adjudicated_image_count, 0);
  assert.equal(result.seed_case_count, 1);
  assert.equal(result.seed_cases_are_not_benchmark_samples, true);
  assert.ok(result.blockers.includes("no_physical_color_ground_truth"));
});

test("readiness requires adjudicated image URIs and required cell coverage", () => {
  const samples = Array.from({ length: 2 }, (_, index) => ({
    image_id: `image-${index}`,
    image_uri: `private://image-${index}`,
    annotation_status: "adjudicated",
    benchmark_axes: ["solid", "daylight"],
    metadata: index === 0 ? { physical_reference: { instrument: "colorimeter", lab: [50, 20, 10] } } : {},
  }));
  const result = evaluateBenchmarkReadinessV1({
    minimum_adjudicated_images: 2,
    required_cells: [{ id: "solid", minimum: 2, axes: ["solid", "daylight"] }],
    samples,
  });
  assert.equal(result.ready, true);
  assert.equal(result.physical_reference_count, 1);
  assert.deepEqual(result.blockers, []);
});
