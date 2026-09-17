import test from "node:test";
import assert from "node:assert/strict";
import {
  applyUnresolvedMeasurementIntegrityGateV1,
  buildLocalMeasurementIntegritySynthesesV1,
  mergeCorrectionSynthesesV1,
} from "../src/intelligence/pieceMeasurementIntegrityV1.js";

test("local contradictions request correction without semantic disagreement", () => {
  const syntheses = buildLocalMeasurementIntegritySynthesesV1({
    garment_zones: { zones: {
      upper_garment: {
        color_mode: "single_color",
        confidence: .55,
        primary_color: { hex: "#F2EFFB", pct: .02 },
      },
      outerwear: {
        color_mode: "multi_color",
        confidence: .14,
        primary_color: { hex: "#C12E2E", pct: .45 },
        detected_colors: [{ hex: "#C12E2E", pct: .45 }, { hex: "#F4F1FB", pct: .30 }],
      },
    } },
  });
  assert.deepEqual(syntheses.map((row) => row.piece).sort(), ["outerwear", "upper_garment"]);
  assert.ok(syntheses.every((row) => row.integrity_v1.force_fresh_segmentation));
});

test("near-duplicate palette clusters are left to deterministic consolidation", () => {
  const syntheses = buildLocalMeasurementIntegritySynthesesV1({
    garment_zones: { zones: { footwear: {
      color_mode: "multi_color", confidence: .7,
      primary_color: { hex: "#DEB3CB", pct: .54 },
      detected_colors: [
        { hex: "#DEB3CB", pct: .54 },
        { hex: "#D0C0CE", pct: .21 },
        { hex: "#E1D2DD", pct: .19 },
      ],
    } } },
  });
  assert.deepEqual(syntheses, []);
});

test("local integrity synthesis overrides a semantic-only plan for the same piece", () => {
  const semantic = { piece: "footwear", reasoning_state: "explainable_divergence" };
  const local = { piece: "footwear", reasoning_state: "appearance_alert", integrity_v1: { required: true } };
  assert.deepEqual(mergeCorrectionSynthesesV1(semantic, local), [local]);
});

test("unresolved low-confidence color is withheld while piece identity remains", () => {
  const result = applyUnresolvedMeasurementIntegrityGateV1({
    garment_zones: { zones: { outerwear: {
      garment_type: "track jacket",
      interpretation: "multi_color",
      confidence: .14,
      primary_color: { hex: "#C12E2E", pct: .45 },
      detected_colors: [{ hex: "#C12E2E", pct: .45 }, { hex: "#F4F1FB", pct: .30 }],
    } } },
  });
  const jacket = result.garment_zones.zones.outerwear;
  assert.equal(jacket.garment_type, "track jacket");
  assert.equal(jacket.validation_decision, "identity_only");
  assert.equal(jacket.publication_decision, "withhold_unresolved_measurement_integrity");
  assert.equal(result.measurement_integrity_v1.passed, false);
});

test("validated fresh target mask clears a stale low-confidence publication gate", () => {
  const result = applyUnresolvedMeasurementIntegrityGateV1({
    garment_zones: {
      segmented_regions: [{
        id: "target_mask_jacket_1",
        zone: "outerwear",
        source_type: "sam_segment",
        region_colors: [{ hex: "#C12E2E", pct: .45, pixel_count: 1200, ownership_validated: true }],
        target_conditioned_mask_v1: {
          spatial_validation: {
            validated: true,
            measured_pixel_count: 1200,
            minimum_owned_pixel_count: 100,
          },
        },
      }],
      zones: { outerwear: {
        garment_type: "track jacket",
        interpretation: "multi_color",
        confidence: .14,
        primary_color: { hex: "#C12E2E", pct: .45 },
        detected_colors: [{ hex: "#C12E2E", pct: .45 }, { hex: "#F4F1FB", pct: .30 }],
      } },
    },
  }, { runtimeSecondPass: { results: [{
    plan: { piece: "jacket", remeasure_visioncore: true },
    visioncore_remeasurement: { ok: false, reason: "timeout" },
  }] } });
  assert.notEqual(result.garment_zones.zones.outerwear.validation_decision, "identity_only");
  assert.equal(result.measurement_integrity_v1.passed, true);
});

test("unvalidated or pixel-empty masks cannot bypass the integrity abstention", () => {
  const outfit = {
    garment_zones: {
      segmented_regions: [{
        id: "target_mask_jacket_1",
        zone: "outerwear",
        source_type: "sam_segment",
        region_colors: [{ hex: "#C12E2E", pct: .45, pixel_count: 0, ownership_validated: true }],
        target_conditioned_mask_v1: {
          spatial_validation: { validated: false, measured_pixel_count: 0, minimum_owned_pixel_count: 100 },
        },
      }],
      zones: { outerwear: {
        confidence: .14,
        primary_color: { hex: "#C12E2E", pct: .45 },
      } },
    },
  };
  const result = applyUnresolvedMeasurementIntegrityGateV1(outfit);
  assert.equal(result.garment_zones.zones.outerwear.validation_decision, "identity_only");
});

test("validated fresh target mask avoids a redundant forced second pass", () => {
  const syntheses = buildLocalMeasurementIntegritySynthesesV1({
    garment_zones: {
      segmented_regions: [{
        id: "target_mask_jacket_1",
        zone: "outerwear",
        source_type: "sam_segment",
        region_colors: [{ hex: "#C12E2E", pct: .45, pixel_count: 1200, ownership_validated: true }],
        target_conditioned_mask_v1: {
          spatial_validation: { validated: true, measured_pixel_count: 1200, minimum_owned_pixel_count: 100 },
        },
      }],
      zones: { outerwear: {
        color_mode: "multi_color",
        confidence: .14,
        primary_color: { hex: "#C12E2E", pct: .45 },
      } },
    },
  });
  assert.deepEqual(syntheses, []);
});

test("an unfinished required remeasurement withholds the matching piece color", () => {
  const result = applyUnresolvedMeasurementIntegrityGateV1({
    garment_zones: { zones: {
      upper_garment: {
        garment_type: "undershirt", interpretation: "single_color", confidence: .55,
        primary_color: { hex: "#4F3130", pct: .43 },
      },
      eyewear: {
        garment_type: "sunglasses", interpretation: "single_color", confidence: .64,
        primary_color: { hex: "#1E0D11", pct: .82 },
      },
    } },
  }, { runtimeSecondPass: { results: [{
    plan: { piece: "upper_garment", remeasure_visioncore: true },
    skipped: true,
    reason: "latency_budget_exhausted",
  }] } });
  assert.equal(result.garment_zones.zones.upper_garment.validation_decision, "identity_only");
  assert.equal(result.garment_zones.zones.eyewear.validation_decision, undefined);
});
