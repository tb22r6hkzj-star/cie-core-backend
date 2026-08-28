# VisionCore SWOT and Threat Controls V1

## Executive position

VisionCore should compete as an evidence-governed fashion color intelligence engine, not as another generic AI stylist. Its defensible claim is that semantic recognition, object ownership, pixel measurement, color correction, confidence, and abstention remain separate and auditable.

## Strengths

1. Object-local color authority instead of global-palette guessing.
2. Garment, accessory, and scene ownership are modeled separately.
3. DINO/SAM perception, deterministic color math, and external semantic reasoning have governed roles.
4. OpenAI cannot override color math or publication authority.
5. Multicolor, boundary contamination, shadow, and accessory precedence have dedicated policies and regression tests.
6. Existing evidence ledgers make explainability possible.
7. Publication can abstain when ownership or measurement is not validated.

## Weaknesses and current controls

| Weakness | Current control | Remaining gate |
|---|---|---|
| Unknown capture quality | `capture_quality_gate_v1` measures resolution, clipping, tonal information, possible blur/cast, filters, and missing regions | Calibrate thresholds on real images before hard-blocking established publication |
| Single-photo instability | `cross_photo_consensus_v1` requires two qualified photos and LAB/identity agreement | Add a product flow that collects multiple photographs |
| Captured pixels confused with physical truth | `consumer_evidence_v1` separates captured color from VisionCore's estimated garment color | Render this distinction in the frontend |
| No completed real benchmark | `benchmark_readiness_v1` refuses to count seed cases and reports missing coverage | Collect, annotate, adjudicate, and retain at least 100 licensed images |
| No physical color ground truth | Readiness audit detects missing instrument/LAB references | Measure a representative garment subset with a calibrated instrument/reference workflow |
| OpenAI not operationally validated | Provider is shadow-by-default, skips without a protected key, and cannot change publication | Add protected key, run shadow cohort, prove zero semantic harm before assist |
| Segmentation errors can corrupt perfect color math | Existing ownership and purity gates abstain from unvalidated DINO-only evidence | Expand difficult boundary, layering, jewelry, transparency, and reflective-material cases |
| Evidence is technical rather than consumer-readable | Consumer evidence contract now provides display-safe fields | Build mask overlay, confidence, warnings, correction UX |
| User corrections could overwrite original evidence | `correction_ledger_v1` preserves the original, records corrections separately, and requires adjudication | Connect the ledger to authenticated persistence and frontend controls |

## Opportunities

1. Consumer wardrobe analysis with evidence rather than opaque ratings.
2. Professional stylist workflow with client archives and repeatable reports.
3. Retail/catalog color attribution and quality control.
4. Resale marketplace listing assistance.
5. Accessibility for users who need plain-language color identification.
6. API licensing to wardrobe, retail, catalog, and visual-search products.
7. Optional calibrated capture for professional users without forcing hardware on consumers.

## Threats and controls

| Threat | Likelihood | Impact | Control | Status |
|---|---:|---:|---|---|
| Foundation models commoditize garment recognition | High | High | Own the benchmark, ontology, color evidence, correction history, and publication policy rather than model access | In progress |
| A competitor copies visible features | High | Medium | Build proprietary adjudicated failure data, versioned evaluation, professional workflow, and protected know-how | Benchmark blocked |
| Incorrect "true color" marketing damages trust | Medium | High | Prohibit physical-truth language from ordinary photographs; show captured versus estimated color and uncertainty | Code control added |
| Poor photos create unstable results | High | High | Quality gate, retake guidance, multi-photo consensus, optional reference card | Code control added; calibration pending |
| Segmentation model drift silently changes results | Medium | High | Version every pipeline/model and require zero-regression benchmark promotion | Framework exists; dataset pending |
| External provider outage, latency, or cost spike | Medium | Medium | Cache, timeout, budget gate, fail open to VisionCore, and keep final authority internal | Implemented |
| External AI changes publication improperly | Low | High | Shadow mode, sanitized schema, explicit authority constitution, zero-harm promotion gate | Implemented |
| Image/privacy exposure | Medium | High | Consent, least retention, deletion choice, restricted benchmark storage, no copyrighted/unlicensed fixtures | Operational policy required |
| Patent window or claim scope is missed | Medium | High | Calendar provisional deadlines and obtain patent-counsel review of improvements and claims | Owner/legal action required |
| Retailers demand verified physical color beyond photo capability | Medium | Medium | Offer calibrated/reference-card lane and describe ordinary-photo results as estimates | Physical workflow pending |
| Subscription or API costs exceed revenue | Medium | Medium | Per-run telemetry, cache reuse, targeted reanalysis, plan allowances, and provider cost ceilings | Partial |

## Promotion doctrine

No new intelligence becomes authoritative merely because its unit tests pass. Promotion order is:

1. `off`
2. `shadow`
3. real-image evaluation
4. threshold calibration
5. `assist`
6. broader outside testing
7. authoritative publication only for evidence classes that satisfy every metric floor

This prevents a feature intended to fix one weakness from reintroducing color contamination elsewhere.
