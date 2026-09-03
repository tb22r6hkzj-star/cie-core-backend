import test from "node:test";
import assert from "node:assert/strict";
import {
  applyTransformGarmentColorAuthorityV1,
  classifyMeasuredGarmentFamilyV1,
  resolveTransformGarmentColorAuthorityV1,
} from "../src/intelligence/transformGarmentColorAuthorityV1.js";

test("muted dark greens remain green instead of collapsing to neutral", () => {
  assert.equal(classifyMeasuredGarmentFamilyV1("#465647", "neutral"), "green");
  assert.equal(classifyMeasuredGarmentFamilyV1("#4E604F", "earth"), "green");
});

test("stronger published lower garment becomes transform garment authority", () => {
  const result = resolveTransformGarmentColorAuthorityV1({
    garment_zones: {
      zones: {
        upper_garment: {
          primary_color: { hex: "#A9532B", color_identity: { family: "orange" } },
          confidence: 0.90,
          coverage: 0.18,
          publication_decision: "publish",
        },
        lower_garment: {
          primary_color: { hex: "#465647", name: "Muted Forest Green", color_identity: { family: "neutral" } },
          confidence: 0.88,
          coverage: 0.55,
          publication_decision: "publish",
        },
      },
    },
  });

  assert.equal(result.available, true);
  assert.equal(result.selected.zone, "lower_garment");
  assert.equal(result.selected.hex, "#465647");
  assert.equal(result.selected.family, "green");
});

test("transform response replaces misleading global garment family but preserves global diagnostics", () => {
  const payload = {
    success: true,
    dominantHex: "#65645F",
    dominantName: "Charcoal Gray",
    garmentColorFamily: "neutral",
    classification: { family: "neutral", lane: "neutral" },
    outfit_analysis: {
      garment_zones: {
        zones: {
          lower_garment: {
            primary_color: {
              hex: "#4E604F",
              name: "Muted Forest Green",
              color_identity: { family: "neutral" },
            },
            confidence: 0.91,
            coverage: 0.62,
            publication_decision: "publish",
          },
        },
      },
    },
  };

  const result = applyTransformGarmentColorAuthorityV1(payload);
  assert.equal(result.dominantHex, "#65645F");
  assert.equal(result.classification.family, "neutral");
  assert.equal(result.garmentColorHex, "#4E604F");
  assert.equal(result.garmentColorName, "Muted Forest Green");
  assert.equal(result.garmentColorFamily, "green");
  assert.equal(result.garmentColorAuthorityV1.selected.zone, "lower_garment");
  assert.equal(result.garmentColorAuthorityV1.global_image_color_is_diagnostic_only, true);
});

test("no authoritative garment leaves existing transform family untouched", () => {
  const payload = {
    garmentColorFamily: "neutral",
    dominantHex: "#65645F",
    outfit_analysis: { garment_zones: { zones: {} } },
  };
  const result = applyTransformGarmentColorAuthorityV1(payload);
  assert.equal(result.garmentColorFamily, "neutral");
  assert.equal(result.garmentColorAuthorityV1, undefined);
});
