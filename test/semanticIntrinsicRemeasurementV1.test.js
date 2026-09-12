import test from "node:test";
import assert from "node:assert/strict";
import { applySemanticIntrinsicRemeasurementV1 } from "../src/intelligence/semanticIntrinsicRemeasurementV1.js";

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

test("external semantics cannot invent a replacement when no owned white candidate exists", () => {
  const region = footwearRegion();
  region.illumination_remeasurement_candidates_v1 = region.region_colors;
  const result = applySemanticIntrinsicRemeasurementV1({ regions: [region], semanticHandoff: handoff() });
  assert.equal(result.summary.applied, false);
  assert.equal(result.regions[0].dominant_hex, "#C2BEC0");
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
