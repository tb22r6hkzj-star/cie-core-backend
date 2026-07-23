
# VisionCore RC1 Recovery Archive

**Status:** Authoritative recovery input for reconstruction  
**Target repository:** `cie-core-backend`  
**Base repository state referenced by recovery work:** production history through `350dae2`  
**Merge rule:** Reconstruct on a reviewable branch. Do not merge until tests and human review pass.

## 1. Purpose and source-of-truth rules

This archive exists because the original RC1 work was completed across Codex tasks but was not merged into the production repository. Git alone therefore cannot recover the complete implementation.

Use this priority order:

1. Recovered completed-task implementation evidence in this archive
2. Recovered regression tests and final test results
3. Recovered final task summaries
4. RC1 reconstruction blueprint
5. Current production repository

Do not treat the earlier specification-based reconstruction branch as authoritative. It was created without the completed-task outputs and explicitly deviated from the recovered implementation.

Do not simplify the recovered behavior, rename the engine to V7, introduce machine learning, remove public fields, or rewrite unrelated systems.

## 2. Cumulative reconstruction order

1. WP-01 — Consolidated Perception Intelligence V5/V6
2. WP-02 — Audit & Enhance Perception V5/V6
3. WP-03 — Focused V6 Hardening Pass
4. WP-04 — Harden Accessory Display Palette Precedence
5. WP-05 — Harden V6 Perception Explainability
6. WP-06 — Harden VisionCore V6 Perception Decisions
7. WP-07 — VisionCore Evaluation Framework

Later packages extend and, where necessary, supersede earlier behavior.

# WP-01 — Consolidated Perception Intelligence V5/V6

## Recovery status

Recovered as final architecture/specification and historical test progression. The original uncommitted patch is not available as a complete diff.

## Objective

Recreate the modular V5/V6 perception foundation and integrate it into the production server pipeline.

## Primary integration

- `src/intelligence/perceptionV5/`
- `src/intelligence/perceptionV6/`
- `src/server.js`

The server must invoke `analyzePerceptionV5(...)` and `analyzePerceptionV6(...)`.

## Required V5 behavior

- Recovery eligibility
- Bounding-box normalization
- Crop hypothesis generation
- Hypothesis evaluation and ranking
- Stability analysis
- Confidence separation
- Contradiction handling
- Arbitration
- Decision traces

## Required V6 behavior

- Evidence ledger
- Consensus
- Object presence
- Zone reconciliation
- Contradiction policy
- Publication gating
- Decision traces

## Historical acceptance evidence

Recovered foundation progression: 25/15, 39/1, then 40 passing and 0 failing. Reconstruct the final 40/0 state, not intermediate attempts.

## Production compatibility

Existing routes, scoring, taxonomy, garment-zone output, retrieval structures, and legacy public fields must remain available. New V5/V6 records must be additive unless a later recovered task explicitly changes publication behavior.

# WP-02 — Audit & Enhance Perception V5/V6

## Recovery status

Recovered as the final pixel-aware architecture and behavioral contract. Intermediate failing states must not be replayed.

## Objective

Add decoded-image evidence and explicit V6 publication modes so V6 can validate detector hypotheses against actual image pixels.

## Primary files

- `src/server.js`
- `test/perceptionV6Pixel.test.js`

## Required integration changes

`buildOutfitAnalysis(...)` must accept `decodedImage`.

Support either `perception_v6_mode` or `v6_mode` with these modes:

- `shadow`
- `assist`
- `authoritative`

## Required pixel-aware behavior

- Crop selection
- Pixel validation
- Region evidence
- DINO lifecycle tracing
- Eyewear/headwear distinction from hair, skin, glare, and dark-patch false positives
- Object-local evidence preservation

## Publication-mode contract

**Shadow:** preserve legacy public fields while computing V6 decisions and diagnostics.

**Assist:** V6 may suppress downstream public cards when evidence indicates a false positive or contaminated result.

**Authoritative:** publish reconciled V6 candidates and decisions as the final perception result.

## Historical acceptance rule

Recreate the final passing scenarios. Do not stop at or replay intermediate states reported as 23/5, 5/2, or 6/1.

# WP-03 — Focused V6 Hardening Pass

## Recovery status

Recovered as the bridge package between pixel-aware V6 and accessory-specific publication hardening.

## Objective

Preserve hard-earned V6 behavior while tightening candidate handling, suppression, object-local color preservation, and lifecycle traceability.

## Required behavior

- Consolidate final candidate-selection and suppression behavior
- Preserve DINO object-local colors through inference and publication
- Retain lifecycle diagnostics that reveal where dominant colors change
- Avoid duplicate helper implementations from archived intermediate attempts
- Keep all pre-accessory V6 regressions green before WP-04

## Integration constraint

This package must not create parallel logic that bypasses `buildOutfitAnalysis(...)`, `inferGarmentZones(...)`, `inferZoneColorRead(...)`, or the production publication flow.

# WP-04 — Harden Accessory Display Palette Precedence

## Recovered commit

`fa65e0a` — Harden accessory display palette precedence

## Recovered change size

- `src/server.js`
- `test/accessoryPalettePreservation.test.js`
- 195 insertions, 4 deletions

## Root cause

Refined palette data existed in `regionColors` and selected DINO regions, but accessory publication could still prefer `accessoryDinoDetectedPalette` for `primary_color`, `secondary_colors`, `accent_colors`, `detected_colors`, and `region_colors`. Correct object identity could survive while final display colors came from lower-priority detector/DINO evidence instead of the refined crop.

## Required palette separation

Keep distinct:

- `raw_detector_palette`
- `pixel_refined_palette`
- `display_palette`
- `display_palette_trace`

Raw evidence remains inspectable but must not overwrite the final display palette after higher-priority object-local evidence is confirmed.

## Required precedence chain

1. `refined_crop`
2. `candidate_region`
3. `raw_dino`
4. `detector`
5. `fallback`

The highest surviving source is authoritative for display publication.

## Required production change

Update `inferZoneColorRead(...)` to build accessory palette sets from refined crop colors, winning candidate DINO region colors, raw DINO colors, original detector fallback, and global fallback. Route accessory publication roles through `display_palette`.

## Accessory zones

- `accessory_jewelry`
- `bag`
- `belt`
- `eyewear`
- `headwear`

## Required helper behavior

Recovered implementation included behavior equivalent to:

- `isAccessoryDisplayPaletteZone(zoneKey)`
- `isBrownFamilyHex(hex)`
- `getAccessoryDisplayColorName(color)`
- contamination-reason evaluation
- source-aware palette compaction/filtering
- display-palette selection and trace generation

Brown-family logic must preserve legitimate brown frames and prevent weak aliases such as dusty rose or warm gray from replacing object-local brown identity.

## Contamination rejection

Reject or suppress skin, beige-shirt bleed, white glare/highlights, background contamination, and patterned-shirt migration. Preserve brown-family frames, dark sunglasses on dark skin, and object-local dark accessory identity.

## Percentage preservation

Preserve raw DINO percentages exactly, including explicit zero and trace values. Do not inflate the dominant color.

## Required trace behavior

A winning refined palette should include metadata such as:

- `source: "refined_crop"`
- `reason_not_replaced: "higher_priority_confirmed_values_are_authoritative"`

`display_palette_trace.selected_source` must identify the winning source.

## Recovered regressions

- Brown eyewear with surrounding skin keeps brown and excludes skin
- Brown eyewear with white glare preserves brown and removes glare
- Brown eyewear with beige shirt excludes shirt-like migration
- Dark sunglasses on dark skin preserve frame color
- Patterned brown shirt below the face does not migrate into eyewear
- Refined crop wins over detector fallback
- Headwear object palette survives without dominant inflation
- Explicit zero/trace accessory values remain preserved

## Recovered test result

27 passing, 0 failing.

# WP-05 — Harden V6 Perception Explainability

## Recovered commit

`813f884` — Harden V6 perception explainability

## Recovered change size

- `src/server.js`
- `test/accessoryPalettePreservation.test.js`
- 178 insertions, 19 deletions

## Objective

Attach defensible confidence and structured explanations to published accessory and zone decisions.

## Required confidence helpers

### `calibrateConfidence(...)`

Accept confidence in 0–1 or 0–100 form, normalize to percentage, apply evidence weighting, clamp to floor/ceiling, and return a rounded 0–100 result.

### `calibrateDisplayColorConfidence(...)`

Recovered formula:

- zone confidence: 0.55
- color percentage: 0.30
- source confidence: 0.15
- evidence weighting after combination
- floor 1
- ceiling 99

## Required publication output

Attach confidence to `primary_color`, `secondary_colors`, `accent_colors`, and `region_colors`.

## Required explainability fields

### `evidence_ledger`

Include zone, source, selected color, published colors, detector evidence, crop/pixel evidence where available, and contamination scores.

### `publication_reasons`

Provide structured reasons including a primary reason.

### `publication_reason`

Mirror the primary structured reason for compatibility.

### `rejected_alternatives`

Each rejected candidate includes a machine-readable rejection reason.

## Contamination model

Replace remaining brittle booleans with weighted evidence scoring while retaining legacy suppression traces. Debug output must expose a numeric contamination total.

## Recovered regression expectations

Published colors have numeric confidence between 1 and 100; evidence ledger zone and selected color are correct; published colors are recorded; publication reason matches the primary structured reason; rejected skin-like alternatives retain reasons; contamination score total is numeric.

## Recovered test result

22 passing, 0 failing.

# WP-06 — Harden VisionCore V6 Perception Decisions

## Recovered commit

`7e2f6bf` — Harden VisionCore V6 perception decisions

## Recovered change size

- `src/server.js`
- `test/perceptionV6Hardening.test.js`
- 273 insertions, 1 deletion

## Objective

Formalize confidence, decision states, evidence hierarchy, calibration metadata, aggregate metrics, and internal consistency without renaming modules or creating V7.

## Centralized confidence configuration

Use one configuration object for object evidence, pixel evidence, geometry, region, coverage, color consistency, publication, skin-like penalty, highlight penalty, and neutral evidence.

## Unified confidence model

Every finalized zone exposes:

- `raw_confidence`
- `calibrated_confidence`
- `unified_confidence`
- normalized input components
- centralized weights
- `publication_state`

Preserve existing confidence fields.

## Publication states

- `confirmed`
- `probable`
- `possible`
- `unknown`
- `rejected`

Unknown/suppressed states derive from interpretation and absence of publishable evidence.

## Evidence chain

1. `detector`
2. `region_selection`
3. `pixel_refinement`
4. `geometry_validation`
5. `contamination_analysis`
6. `alternative_candidates`
7. `publication_decision`

## Decision consistency

Each zone exposes `decision_consistency.valid` and `decision_consistency.issues`. Aggregate consistency records exist at garment-zone level.

## Decision metrics

Each finalized zone includes numeric:

- `decision_complexity`
- `candidate_count`
- `confidence_spread`
- `alternative_margin`
- `dominant_margin`
- `publication_certainty`

`publication_certainty` must match `publication_state`. Aggregate metrics are available by zone.

## Calibration metadata

Each zone includes:

- `predicted_confidence`
- `final_confidence`
- `supporting_evidence`
- `confidence_source: "formula_v6_unified_confidence"`
- `calibration_ready: true`

Aggregate confidence-calibration records are available by zone.

## Required enrichment flow

Compute unified confidence, assign publication state, build evidence chain, build decision metrics, attach calibration metadata, validate the decision, and publish aggregate consistency/metrics/calibration.

## Constraints

No machine learning, no public field removals, no module rename, no V7.

## Recovered test result

22 passing, 0 failing.

# WP-07 — VisionCore Evaluation Framework

## Recovered commit

`b38cd85` — Add VisionCore evaluation framework

## Recovered change size

Five files, 388 insertions:

- `src/evaluation/README.md`
- `src/evaluation/benchmarkDataset.js`
- `src/evaluation/index.js`
- `src/evaluation/metrics.js`
- `test/visionCoreEvaluationFramework.test.js`

## Objective

Create an independent evaluation ecosystem around production V6 without changing production perception behavior.

## Architecture

VEF wraps an injected inference function. It measures VisionCore but does not redesign or replace the engine.

## Benchmark schema

Schema version: `vef_benchmark_v1`.

A normalized sample supports:

- `image_id`
- `image_uri`
- `expected_objects`
- `expected_colors`
- `expected_publication_state`
- `expected_confidence_range`
- `expected_evidence_chain`
- `expected_dominant_color`
- `expected_secondary_colors`
- `ground_truth_notes`
- `metadata`

Required behavior includes equivalents of `normalizeBenchmarkSample(...)`, `createBenchmarkDataset(...)`, and `loadBenchmarkDataset(...)`.

`image_id` and `dataset_id` are mandatory. Arrays are normalized, confidence range defaults to 0–1, and schema version is recorded.

## Evaluation metrics

- Object precision and recall
- LAB color distance
- Color accuracy
- Confidence error
- Confidence bins
- Expected Calibration Error
- Maximum Calibration Error
- Brier score

## Evaluation runner

`runEvaluation(...)` invokes an injected inference callback, profiles execution, evaluates each sample, produces per-image metrics, and emits debug artifacts for candidate rankings, evidence chain, confidence model, publication reasoning, color hierarchy, and decision metrics.

## Scorecard

- Perception accuracy
- Publication precision
- Color fidelity
- Evidence quality
- Consistency
- Explainability
- Calibration
- Performance
- Overall reliability

## Engine health report

- Overall engine health
- Confidence stability
- Regression count
- Publication success rate
- Color fidelity
- Decision reliability
- Average inference time
- Calibration readiness

## Performance profiling

- Total inference time
- Color clustering time
- Zone reasoning time
- Publication reasoning time
- Evidence generation time
- Memory usage

## Regression and drift detection

Compare current and baseline reports for confidence, color, publication, decision, and performance drift. Decision-drift records retain baseline and current structured results per image.

## Quality gates

Mandatory and configurable. Fail when a configured regression threshold or average inference-time threshold is exceeded.

## Fixtures

Initial fixtures are synthetic and metadata-only. Do not add copyrighted images. Future real-image fixtures must be internally owned, licensed, or non-copyrighted.

## Remaining technical debt

- Wire production V6 inference directly into `runEvaluation(...)`
- Add real licensed benchmark images
- Add persistent historical storage for reports/baselines
- Keep evaluation independent from production behavior

## Recovered test result

26 passing, 0 failing.

## 3. Final cumulative API contract

Existing public behavior remains available.

### Accessory palette

- `raw_detector_palette`
- `pixel_refined_palette`
- `display_palette`
- `display_palette_trace`

### Explainability

- color-level `confidence`
- `evidence_ledger`
- `publication_reasons`
- `publication_reason`
- `rejected_alternatives`

### Decision framework

- `raw_confidence`
- `calibrated_confidence`
- `unified_confidence`
- `publication_state`
- `evidence_chain`
- `decision_consistency`
- `decision_metrics`
- `calibration_metadata`

### Garment-zone aggregates

- `decision_consistency`
- `decision_metrics`
- `confidence_calibration`

### Evaluation

Independent modules under `src/evaluation/`; importing evaluation must not alter production inference.

## 4. Required reconstruction validation

After each work package:

1. Run targeted tests
2. Run the complete suite
3. Resolve regressions
4. Commit atomically
5. Record deviations

At completion:

- Complete suite has 0 failures
- Existing routes and fields are preserved
- Shadow/assist/authoritative modes are verified
- Object-local accessory colors and zero/trace percentages are preserved
- Explainability and decision metadata are verified
- VEF scorecard, health report, calibration, drift, and quality gates are verified
- Production endpoint smoke tests pass

## 5. Mandatory deviation rule

Where this archive contains final behavioral evidence but not a complete historical patch, implement the smallest production-integrated solution that exactly satisfies the recovered contract and regressions. List every such case in the final deviation report. Do not claim exact historical parity when the original diff is absent.

## 6. Deliverables

Produce a clean reviewable branch and report:

- Branch name
- Base commit
- Ordered commit list
- Files changed
- Targeted and complete test results after every package
- Final API compatibility report
- Deviation report
- Unresolved technical debt
- Merge-readiness recommendation

Do not merge automatically.
