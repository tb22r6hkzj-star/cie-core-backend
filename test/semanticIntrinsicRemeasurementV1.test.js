import test from "node:test";
import assert from "node:assert/strict";
import {
  applySemanticIntrinsicPublicationV1,
  applySemanticIntrinsicRemeasurementV1,
} from "../src/intelligence/semanticIntrinsicRemeasurementV1.js";
import { applyPieceColorOwnershipV1 } from "../src/intelligence/pieceColorOwnershipV1.js";
import { sanitizeCustomerFacingZonesV1 } from "../src/intelligence/customerFacingZoneSanitizationV1.js";

function handoff(overrides = {}) {
  return {
    mode: "assist",
    semantic_observation: {
      claims: [{
        action: "support",
        piece: "shoes",
        perceived_color_family: "white",
        color_confidence: 0.94,
        lighting_cue: "night scene with deep shadows and a cool cast",
        color_appearance_cue: "white material appears gray in shaded areas",
        ...overrides,
      }],
    },
  };
}

function footwearRegion() {
  return {
    id: "footwear_1",
    zone: "footwear",
    dominant_hex: "#C2BEC0",
    owned_pixel_count: 1000,
    region_colors: [
      { hex: "#C2BEC0", pct: 0.33, pixel_count: 330, total_owned_pixel_count: 1000 },
      { hex: "#A39F9D", pct: 0.25, pixel_count: 250, total_owned_pixel_count: 1000 },
    ],
    illumination_remeasurement_candidates_v1: [
      { hex: "#C2BEC0", pct: 0.33, pixel_count: 330, total_owned_pixel_count: 1000 },
      { hex: "#A39F9D", pct: 0.25, pixel_count: 250, total_owned_pixel_count: 1000 },
      { hex: "#EFEDEE", pct: 0.04, pixel_count: 40, total_owned_pixel_count: 1000 },
    ],
  };
}

test("white footwear under shadow promotes an exact owned bright-neutral measurement", () => {
  const result = applySemanticIntrinsicRemeasurementV1({
    regions: [footwearRegion()],
    semanticHandoff: handoff(),
  });
  const region = result.regions[0];
  assert.equal(result.summary.applied, true);
  assert.equal(region.dominant_hex, "#EFEDEE");
  assert.equal(region.region_colors[0].hex, "#EFEDEE");
  assert.equal(region.region_colors[0].pixel_count, 40);
  assert.equal(region.color_debug.semantic_intrinsic_remeasurement_v1.authority_owner, "visioncore");
  assert.equal(region.color_debug.semantic_intrinsic_remeasurement_v1.external_numeric_color_authority, false);
  assert.equal(region.color_debug.semantic_intrinsic_remeasurement_v1.selected_hex_was_measured_from_owned_pixels, true);
});

test("a semantic suggestion without ambiguous lighting cannot alter measured color", () => {
  const result = applySemanticIntrinsicRemeasurementV1({
    regions: [footwearRegion()],
    semanticHandoff: handoff({ lighting_cue: "even neutral studio lighting", color_appearance_cue: "clear white" }),
  });
  assert.equal(result.summary.applied, false);
  assert.equal(result.regions[0].dominant_hex, "#C2BEC0");
});

test("external semantics cannot invent a replacement from a non-calibratable dark measurement", () => {
  const region = footwearRegion();
  region.dominant_hex = "#555555";
  region.region_colors = [{ hex: "#555555", pct: 0.8, pixel_count: 800, total_owned_pixel_count: 1000 }];
  region.illumination_remeasurement_candidates_v1 = region.region_colors;
  const result = applySemanticIntrinsicRemeasurementV1({ regions: [region], semanticHandoff: handoff() });
  assert.equal(result.summary.applied, false);
  assert.equal(result.regions[0].dominant_hex, "#555555");
});

test("VisionCore normalizes a measured neutral shadow when no white pixel cluster survives", () => {
  const region = footwearRegion();
  region.illumination_remeasurement_candidates_v1 = [
    ...region.region_colors,
    { hex: "#D2CECF", pct: 0.09, pixel_count: 90, total_owned_pixel_count: 1000 },
  ];
  const result = applySemanticIntrinsicRemeasurementV1({ regions: [region], semanticHandoff: handoff() });
  const debug = result.regions[0].color_debug.semantic_intrinsic_remeasurement_v1;
  assert.equal(result.summary.applied, true);
  assert.equal(result.regions[0].dominant_hex, "#EFEDEE");
  assert.equal(debug.selected_hex_was_measured_from_owned_pixels, false);
  assert.equal(debug.selected_hex_was_visioncore_calibrated, true);
  assert.equal(debug.derived_from_measured_hex, "#C2BEC0");
  assert.equal(debug.authority_owner, "visioncore");
});

test("white-family semantics cannot replace a strongly chromatic measurement", () => {
  const region = footwearRegion();
  region.dominant_hex = "#DB5A97";
  region.region_colors = [{ hex: "#DB5A97", pct: 0.7, pixel_count: 700, total_owned_pixel_count: 1000 }];
  const result = applySemanticIntrinsicRemeasurementV1({ regions: [region], semanticHandoff: handoff() });
  assert.equal(result.summary.applied, false);
  assert.equal(result.regions[0].dominant_hex, "#DB5A97");
});

test("shadow and off modes preserve the original publication", () => {
  for (const mode of ["shadow", "off"]) {
    const result = applySemanticIntrinsicRemeasurementV1({
      regions: [footwearRegion()],
      semanticHandoff: { ...handoff(), mode },
    });
    assert.equal(result.summary.applied, false);
    assert.equal(result.regions[0].dominant_hex, "#C2BEC0");
  }
});

test("validated intrinsic remeasurement survives downstream mask authority selection", () => {
  const remeasured = applySemanticIntrinsicRemeasurementV1({
    regions: [{
      ...footwearRegion(),
      source_type: "sam_segment",
      label: "sneaker",
      segment_label: "sneaker",
      confidence: 94,
      mask_url: "https://example.test/mask.png",
      mask_geometry: { bbox: { x: 0.1, y: 0.7, width: 0.3, height: 0.2 } },
      mask_color_ownership_v1: { applied: true },
      target_conditioned_mask_v1: { applied: true, spatially_validated: true },
    }],
    semanticHandoff: handoff(),
  });
  const owned = applyPieceColorOwnershipV1({
    decodedImage: { width: 2, height: 2, data: new Uint8Array(16) },
    regions: remeasured.regions,
  });
  assert.equal(owned.regions[0].dominant_hex, "#EFEDEE");
  assert.equal(owned.regions[0].region_colors[0].measurement_authority, "selected");
  assert.equal(owned.regions[0].region_colors[0].measurement_source, "exclusive_sam_mask_pixels_intrinsic_remeasurement");
});

test("final publication cannot restore a stale graphite footwear authority over intrinsic white", () => {
  const remeasured = applySemanticIntrinsicRemeasurementV1({
    regions: [{
      ...footwearRegion(),
      confidence: 0.8,
      label: "sneakers",
    }],
    semanticHandoff: handoff(),
  });
  const staleAnalysis = {
    garment_zones: { zones: { footwear: {
      name: "Graphite",
      hex: "#A3A09F",
      dominant_hex: "#A3A09F",
      primary_color: { hex: "#A3A09F", pct: 0.58 },
      dominant_color: { hex: "#A3A09F", pct: 0.58 },
      interpretation: "single_color",
      confidence: 58,
    } } },
    piece_color_ownership_v1: { accessory_color_authorities: [{
      id: "stale_shoe",
      zone: "footwear",
      confidence: 0.99,
      applied: true,
      dominant_hex: "#A3A09F",
      region_colors: [{ hex: "#A3A09F", pct: 0.58 }],
      color_authority_source: "piece_color_ownership_v1",
    }] },
    garment_analysis: { detected_items: [{ type: "footwear", primary_color: { hex: "#A3A09F" } }] },
  };

  const published = applySemanticIntrinsicPublicationV1({
    outfitAnalysis: staleAnalysis,
    regions: remeasured.regions,
    summary: remeasured.summary,
  });
  const sanitized = sanitizeCustomerFacingZonesV1(published);
  const footwear = sanitized.garment_zones.zones.footwear;
  assert.equal(footwear.hex, "#EFEDEE");
  assert.equal(footwear.dominant_hex, "#EFEDEE");
  assert.equal(footwear.primary_color.hex, "#EFEDEE");
  assert.equal(footwear.name, "Soft White");
  assert.equal(footwear.semantic_intrinsic_publication_v1.authority_owner, "visioncore");
  assert.equal(sanitized.piece_color_ownership_v1.accessory_color_authorities[0].dominant_hex, "#EFEDEE");
  assert.equal(sanitized.garment_analysis.detected_items[0].primary_color.hex, "#EFEDEE");
});
