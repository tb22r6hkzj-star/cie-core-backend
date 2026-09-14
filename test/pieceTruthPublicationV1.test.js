import test from "node:test";
import assert from "node:assert/strict";
import {
  applyPieceTruthPublicationV1,
  buildPieceTruthPublicationV1,
} from "../src/intelligence/pieceTruthPublicationV1.js";

test("piece truth keeps confidence, color share, and mask coverage semantically separate", () => {
  const truth = buildPieceTruthPublicationV1({
    garment_zones: { zones: {
      outerwear: {
        garment_type: "patterned jacket",
        unified_confidence: 14,
        mask_coverage: 0.62,
        color_mode: "multi_color",
        primary_color: { hex: "#3C332E", pct: 0.76, name: "Rich Brown" },
        region_colors: [
          { hex: "#3C332E", pct: 0.76 },
          { hex: "#8B7769", pct: 0.24, pattern_repetition_supported: true },
        ],
      },
    } },
  });
  const piece = truth.pieces[0];
  assert.equal(piece.metrics_v1.measurement_confidence, 0.14);
  assert.equal(piece.metrics_v1.primary_color_share, 0.76);
  assert.equal(piece.metrics_v1.mask_coverage, 0.62);
  assert.equal(truth.metric_contract_v1.units, "ratio_0_to_1");
});

test("piece truth consolidates duplicate projections that share region lineage", () => {
  const truth = buildPieceTruthPublicationV1({
    garment_zones: { zones: {
      accessory_necklace: {
        accessory_type: "necklace",
        region_id: "necklace-mask-1",
        confidence: 0.57,
        color_publication_decision: "withhold_unvalidated_color",
      },
    } },
    accessory_instances_v1: { instances: [{
      instance_id: "necklace_2",
      zone_key: "accessory_necklace_2",
      accessory_type: "necklace",
      source_region_id: "necklace-mask-1",
      confidence: 0.48,
      color_publication_decision: "withhold_unvalidated_color",
    }] },
  });
  assert.equal(truth.pieces.length, 1);
  assert.equal(truth.pieces[0].piece_type, "necklace");
});

test("piece truth preserves spatially distinct instances of the same type", () => {
  const truth = buildPieceTruthPublicationV1({
    accessory_instances_v1: { instances: [
      { accessory_type: "earrings", zone_key: "accessory_earring_left", region_id: "left-ear" },
      { accessory_type: "earrings", zone_key: "accessory_earring_right", region_id: "right-ear" },
    ] },
  });
  assert.equal(truth.pieces.length, 2);
});

test("piece truth consolidates same-type cards without independent spatial lineage", () => {
  const truth = buildPieceTruthPublicationV1({
    garment_zones: { zones: {
      accessory_necklace: { accessory_type: "necklace", confidence: 0.49 },
    } },
    accessory_instances_v1: { instances: [{
      instance_id: "necklace_2",
      zone_key: "accessory_necklace_2",
      accessory_type: "necklace",
      confidence: 0.88,
    }] },
  });
  assert.equal(truth.pieces.length, 1);
  assert.equal(truth.pieces[0].metrics_v1.measurement_confidence, 0.88);
});

test("publication guard links legacy cards to their canonical piece", () => {
  const next = applyPieceTruthPublicationV1({
    outfit_analysis: {
      garment_zones: { zones: {
        upper_garment: {
          garment_type: "shirt",
          confidence: 0.8,
          primary_color: { hex: "#F4F2EE", pct: 0.95 },
        },
      } },
    },
  });
  const zone = next.outfit_analysis.garment_zones.zones.upper_garment;
  assert.equal(zone.piece_truth_ref, "piece_upper_garment");
  assert.equal(zone.metrics_v1.primary_color_share, 0.95);
  assert.equal(next.outfit_analysis.piece_truth_v1.by_zone.upper_garment, "piece_upper_garment");
});

test("required but unfinished second pass is explicit in every piece record", () => {
  const truth = buildPieceTruthPublicationV1({
    external_intelligence: {
      runtime_second_pass_v1: { required: true, completed: false, reason: "mask_contradiction" },
    },
    garment_zones: { zones: { footwear: { garment_type: "shoe", confidence: 0.7 } } },
  });
  assert.equal(truth.pieces[0].correction_v1.state, "required_unresolved");
  assert.equal(truth.pieces[0].correction_v1.reason, "mask_contradiction");
});

test("withheld color truth publishes unknown mode and piece-specific correction state", () => {
  const truth = buildPieceTruthPublicationV1({
    external_intelligence: { runtime_second_pass_v1: {
      required: true,
      results: [{ plan: { piece: "upper_garment", remeasure_visioncore: true }, skipped: true }],
    } },
    garment_zones: { zones: {
      upper_garment: { garment_type: "shirt", color_mode: "multicolor", confidence: .55 },
      eyewear: { garment_type: "sunglasses", color_mode: "single_color", confidence: .8, primary_color: { hex: "#111111", pct: 1 } },
    } },
  });
  const shirt = truth.pieces.find((piece) => piece.zone_key === "upper_garment");
  const glasses = truth.pieces.find((piece) => piece.zone_key === "eyewear");
  assert.equal(shirt.color_mode, "unknown");
  assert.equal(shirt.correction_v1.state, "required_unresolved");
  assert.equal(glasses.correction_v1.state, "not_required");
});
