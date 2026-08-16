# VisionCore Evaluation Framework (VEF)

VEF is an independent measurement layer for VisionCore V6. It wraps an injected inference callback and must not redesign, replace, or mutate production perception behavior.

## Benchmark datasets

Schema version: `vef_benchmark_v1`.

Use `normalizeBenchmarkSample`, `createBenchmarkDataset`, or `loadBenchmarkDataset`. Every sample requires `image_id`; every dataset requires `dataset_id`. Arrays are normalized and `expected_confidence_range` defaults to `[0, 1]`.

Synthetic or metadata-only fixtures are appropriate for repository tests. Do not add copyrighted benchmark imagery. Future real-image fixtures must be internally owned, licensed, or non-copyrighted.

## Metrics

VEF exposes object precision/recall, LAB color distance, color accuracy, confidence error, confidence bins, Expected Calibration Error, Maximum Calibration Error, and Brier score.

## Evaluation runner

`runEvaluation(...)` accepts a dataset plus an injected `infer(sample)` callback. It records per-image metrics and debug artifacts for candidate rankings, evidence chains, confidence models, publication reasoning, color hierarchy, and decision metrics.

Example:

```js
const report = await runEvaluation({
  dataset,
  infer: async (sample) => productionInference(sample.image_uri),
});
```

The callback is deliberately injected so importing `src/evaluation/` has no production inference side effects.

## Reports

Evaluation reports contain a scorecard for perception accuracy, publication precision, color fidelity, evidence quality, consistency, explainability, calibration, performance, and overall reliability.

The engine-health report includes overall engine health, confidence stability, regression count, publication success rate, color fidelity, decision reliability, average inference time, and calibration readiness.

Performance profiling records total inference time plus optional color-clustering, zone-reasoning, publication-reasoning, evidence-generation, and memory-use measurements supplied by the inference result.

## Regression and drift

`compareEvaluationReports(current, baseline)` compares confidence, color, publication, decision, and performance drift and retains baseline/current structured rows per image.

`evaluateQualityGates(report, config)` is mandatory-capable and configurable. Supported gates include maximum regressions, maximum average inference time, and minimum overall reliability.

## Technical debt retained from RC1 recovery

- Wire production V6 inference into an explicit evaluation entry point without coupling evaluation imports to production behavior.
- Add licensed/internal real-image benchmarks.
- Add persistent historical storage for reports and baselines.
- Keep evaluation independent from production behavior.
