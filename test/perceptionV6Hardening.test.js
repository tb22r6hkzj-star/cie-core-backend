import test from "node:test";
import assert from "node:assert/strict";

process.env.NODE_ENV = "test";

const { buildOutfitAnalysis } = await import("../src/server.js");

function buildDecisionFixture() {
  return buildOutfitAnalysis({
    dominantHex: "#D0A080",
    topColors: [
      { hex: "#D0A080", pct: 0.48, name: "Skin" },
      { hex: "#1E2A46", pct: 0.32, name: "Navy" },
      { hex: "#3D2417", pct: 0.20, name: "Brown" },
    ],
    segmentedRegions: [
      {
        id: "wp06_eyewear",
        source_type: "grounding_dino",
        zone: "eyewear",
        label: "eyewear",
        segment_label: "eyewear",
        dominant_hex: "#3D2417",
        confidence: 0.94,
        coverage: 0.09,
        bbox: { x_min: 0.3, y_min: 0.18, x_max: 0.7, y_max: 0.35 },
        region_colors: [
          { hex: "#3D2417", pct: 0.78, name: "Brown" },
          { hex: "#171719", pct: 0.18, name: "Black" },
          { hex: "#F4F1EC", pct: 0.04, name: "Glare" },
        ],
      },
      {
        id: "wp06_upper",
        source_type: "grounding_dino",
        zone: "upper_garment",
        label: "shirt",
        segment_label: "shirt",
        dominant_hex: "#1E2A46",
        confidence: 0.91,
        coverage: 0.34,
        bbox: { x_min: 0.18, y_min: 0.35, x_max: 0.82, y_max: 0.72 },
        region_colors: [{ hex: "#1E2A46", pct: 0.9, name: "Navy" }],
      },
    ],
    dinoGarmentRegions: [],
    pipeline: { sam_enabled: false, dino_enabled: true },
  });
}

const expectedEvidenceStages = [
  "detector",
  "region_selection",
  "pixel_refinement",
  "geometry_validation",
  "contamination_analysis",
  "alternative_candidates",
  "publication_decision",
];

const validStates = new Set(["confirmed", "probable", "possible", "unknown", "rejected"]);
const certaintyByState = { confirmed: 1, probable: 0.8, possible: 0.6, unknown: 0.3, rejected: 0 };

test("WP-06 finalized zones expose unified confidence, centralized weights, and publication state", () => {
  const analysis = buildDecisionFixture();
  const zone = analysis.garment_zones.zones.eyewear;

  assert.ok(zone);
  assert.ok(Number.isFinite(zone.raw_confidence));
  assert.ok(Number.isFinite(zone.calibrated_confidence));
  assert.ok(Number.isFinite(zone.unified_confidence));
  assert.ok(zone.raw_confidence >= 0 && zone.raw_confidence <= 100);
  assert.ok(zone.calibrated_confidence >= 0 && zone.calibrated_confidence <= 100);
  assert.equal(zone.unified_confidence, zone.calibrated_confidence);
  assert.ok(validStates.has(zone.publication_state));
  assert.equal(zone.confidence_weights.object_evidence, 0.20);
  assert.equal(zone.confidence_weights.pixel_evidence, 0.16);
  assert.equal(zone.confidence_weights.publication, 0.18);
  assert.ok(Number.isFinite(zone.confidence_inputs.object_evidence));
  assert.ok(Number.isFinite(zone.confidence_inputs.color_consistency));
});

test("WP-06 evidence hierarchy and calibration metadata are complete and ordered", () => {
  const analysis = buildDecisionFixture();
  const zone = analysis.garment_zones.zones.eyewear;

  assert.deepEqual(zone.evidence_chain.map((entry) => entry.stage), expectedEvidenceStages);
  assert.equal(zone.evidence_chain.length, 7);
  assert.equal(zone.calibration_metadata.predicted_confidence, zone.raw_confidence);
  assert.equal(zone.calibration_metadata.final_confidence, zone.unified_confidence);
  assert.equal(zone.calibration_metadata.confidence_source, "formula_v6_unified_confidence");
  assert.equal(zone.calibration_metadata.calibration_ready, true);
  assert.ok(Array.isArray(zone.calibration_metadata.supporting_evidence));
  assert.ok(zone.calibration_metadata.supporting_evidence.includes("publication_decision"));
});

test("WP-06 decision metrics are numeric and publication certainty matches publication state", () => {
  const analysis = buildDecisionFixture();
  const zone = analysis.garment_zones.zones.eyewear;
  const metrics = zone.decision_metrics;

  for (const key of [
    "decision_complexity",
    "candidate_count",
    "confidence_spread",
    "alternative_margin",
    "dominant_margin",
    "publication_certainty",
  ]) {
    assert.ok(Number.isFinite(metrics[key]), `${key} must be numeric`);
  }
  assert.equal(metrics.publication_certainty, certaintyByState[zone.publication_state]);
  assert.ok(metrics.candidate_count >= 1);
  assert.ok(metrics.decision_complexity >= 1);
});

test("WP-06 decision consistency and garment-zone aggregates remain internally aligned", () => {
  const analysis = buildDecisionFixture();
  const garmentZones = analysis.garment_zones;
  const zone = garmentZones.zones.eyewear;

  assert.equal(zone.decision_consistency.valid, true);
  assert.deepEqual(zone.decision_consistency.issues, []);
  assert.deepEqual(garmentZones.decision_consistency.eyewear, zone.decision_consistency);
  assert.deepEqual(garmentZones.decision_metrics.eyewear, zone.decision_metrics);
  assert.deepEqual(garmentZones.confidence_calibration.eyewear, zone.calibration_metadata);
});

test("WP-06 enriches decisions without changing recovered accessory color identity", () => {
  const analysis = buildDecisionFixture();
  const zone = analysis.garment_zones.zones.eyewear;

  assert.equal(zone.primary_color.hex, "#3D2417");
  assert.ok(zone.region_colors.some((color) => color.hex === "#3D2417"));
  assert.ok(!zone.region_colors.some((color) => color.hex === "#F4F1EC"));
  assert.equal(zone.publication_reason, zone.publication_reasons.primary);
});
