import test from "node:test";
import assert from "node:assert/strict";
import { executeRuntimeSecondPassV1 } from "../src/intelligence/runtimeSecondPassV1.js";

const syntheses = [{
  piece: "upper_garment",
  reasoning_state: "appearance_alert",
  measurement_truth: { confidence: 0.55 },
  appearance_truth: { confidence: 0.95 },
}];

test("executes targeted VisionCore remeasurement only when plan requires it", async () => {
  let calls = 0;
  const result = await executeRuntimeSecondPassV1({
    syntheses,
    imageUrl: "https://example.com/a.jpg",
    remeasureVisionCore: async ({ piece }) => {
      calls += 1;
      return { piece, family: "red", hex: "#6F263D", confidence: 0.9 };
    },
  });
  assert.equal(calls, 1);
  assert.equal(result.planned_count, 1);
  assert.equal(result.results[0].visioncore_remeasurement.ok, true);
  assert.equal(result.publication_changed, false);
  assert.equal(result.required, true);
  assert.equal(result.completed, true);
});

test("strong-measurement divergence reassesses semantics without remeasurement", async () => {
  let remeasureCalls = 0;
  let semanticCalls = 0;
  const result = await executeRuntimeSecondPassV1({
    syntheses: [{
      piece: "upper_garment",
      reasoning_state: "explainable_divergence",
      measurement_truth: { confidence: 0.94 },
      appearance_truth: { confidence: 0.9 },
    }],
    remeasureVisionCore: async () => { remeasureCalls += 1; },
    reassessSemantic: async () => { semanticCalls += 1; return { family: "brown" }; },
  });
  assert.equal(remeasureCalls, 0);
  assert.equal(semanticCalls, 1);
  assert.equal(result.results[0].plan.preserve_current_measurement, true);
});

test("one-pass cap prevents recursive retries", async () => {
  const result = await executeRuntimeSecondPassV1({ syntheses, attempt: 1 });
  assert.equal(result.planned_count, 0);
  assert.equal(result.executed_count, 0);
});

test("latency budget can skip extra work instead of blocking indefinitely", async () => {
  const result = await executeRuntimeSecondPassV1({
    syntheses,
    totalBudgetMs: 100,
    remeasureVisionCore: async () => ({ family: "red" }),
  });
  assert.equal(result.planned_count, 1);
  assert.equal(result.results[0].reason, "latency_budget_exhausted");
  assert.equal(result.completed, false);
});

test("independent high-priority corrections run concurrently inside the reserve", async () => {
  let active = 0;
  let peak = 0;
  const rows = ["outerwear", "upper_garment", "lower_garment", "footwear"].map((piece) => ({
    piece,
    reasoning_state: "appearance_alert",
    measurement_truth: { confidence: 0.55 },
    appearance_truth: { confidence: 0.95 },
    integrity_v1: { required: true, force_fresh_segmentation: true, reasons: ["published_measurement_below_confidence_floor"] },
  }));
  const result = await executeRuntimeSecondPassV1({
    syntheses: rows,
    totalBudgetMs: 2000,
    remeasureVisionCore: async ({ piece }) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 20));
      active -= 1;
      return { piece, available: true, regions: [] };
    },
  });
  assert.equal(result.completed, true);
  assert.equal(result.max_concurrency, 4);
  assert.equal(peak, 4);
});
