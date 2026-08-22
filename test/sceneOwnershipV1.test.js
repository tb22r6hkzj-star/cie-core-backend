import test from "node:test";
import assert from "node:assert/strict";
import {
  buildSceneOwnershipV1,
  selectOutfitReasoningPaletteV1,
} from "../src/intelligence/sceneOwnershipV1.js";

function zones() {
  return {
    zones: {
      upper_garment: {
        primary_color: { hex: "#935234", pct: 1 },
        dominant_color: { hex: "#935234", pct: 0.98 },
        scene_context_candidates: [{ hex: "#C9A778", pct: 0.22 }],
        detected_colors: [
          { hex: "#935234", pct: 0.98 },
          { hex: "#C17D5A", pct: 0.22 },
          { hex: "#526455", pct: 0.19 },
        ],
      },
      lower_garment: {
        primary_color: { hex: "#3F5041", pct: 1 },
        dominant_color: { hex: "#3F5041", pct: 0.98 },
      },
    },
  };
}

test("separates owned outfit colors from positive scene context", () => {
  const result = buildSceneOwnershipV1({
    authoritativeGarmentZones: zones(),
    normalizedColors: [
      { hex: "#935234", pct: 0.3 },
      { hex: "#3F5041", pct: 0.25 },
      { hex: "#C9A778", pct: 0.2 },
      { hex: "#EEE1CC", pct: 0.15 },
    ],
  });
  assert.ok(result.outfit_palette.some((c) => c.hex === "#935234"));
  assert.ok(result.outfit_palette.some((c) => c.hex === "#3F5041"));
  assert.ok(!result.outfit_palette.some((c) => c.hex === "#C9A778"));
  assert.ok(result.scene_palette.some((c) => c.hex === "#C9A778"));
  assert.ok(result.unknown_palette.some((c) => c.hex === "#EEE1CC"));
});

test("global-only colors remain unknown rather than being guessed as background", () => {
  const result = buildSceneOwnershipV1({
    authoritativeGarmentZones: zones(),
    normalizedColors: [{ hex: "#466A8A", pct: 0.4 }],
  });
  assert.equal(result.scene_palette.length, 1);
  assert.ok(result.unknown_palette.some((c) => c.hex === "#466A8A"));
});

test("raw garment detected colors are not automatically positive outfit ownership", () => {
  const result = buildSceneOwnershipV1({
    authoritativeGarmentZones: zones(),
    normalizedColors: [
      { hex: "#C17D5A", pct: 0.3 },
      { hex: "#526455", pct: 0.2 },
    ],
  });
  assert.ok(!result.outfit_palette.some((c) => c.hex === "#C17D5A"));
  assert.ok(!result.outfit_palette.some((c) => c.hex === "#526455"));
  assert.equal(result.policy.raw_region_colors_are_positive_outfit_ownership, false);
});

test("outfit reasoning palette requires positive outfit ownership", () => {
  const result = buildSceneOwnershipV1({
    authoritativeGarmentZones: zones(),
    normalizedColors: [
      { hex: "#C17D5A", pct: 0.7 },
      { hex: "#C9A778", pct: 0.6 },
    ],
  });
  assert.ok(result.outfit_palette.length >= 2);
  assert.ok(result.outfit_palette.every((c) => c.ownership === "outfit"));
  assert.ok(result.outfit_palette.every((c) => !["#C17D5A", "#C9A778"].includes(c.hex)));
  assert.equal(result.policy.unknown_global_colors_can_vote_as_outfit_reasoning, false);
});

test("owned accessories remain outfit members instead of scene context", () => {
  const garmentAnalysis = {
    detected_items: [
      { type: "footwear", primary_color: { hex: "#101216", pct: 0.9 } },
      { type: "bag", dominant_color: { hex: "#4B2F25", pct: 0.8 } },
    ],
  };
  const result = buildSceneOwnershipV1({
    authoritativeGarmentZones: zones(),
    garmentAnalysis,
    normalizedColors: [],
  });
  assert.ok(result.ownership_map.outfit.some((c) => c.owner_zone === "footwear"));
  assert.ok(result.ownership_map.outfit.some((c) => c.owner_zone === "bag"));
});

test("one positively owned garment remains the entire reasoning palette", () => {
  const onePiece = buildSceneOwnershipV1({
    authoritativeGarmentZones: {
      zones: {
        upper_garment: {
          primary_color: { hex: "#935234", pct: 1 },
          scene_context_candidates: [{ hex: "#C9A778", pct: 0.8 }],
        },
      },
    },
    normalizedColors: [
      { hex: "#935234", pct: 0.35 },
      { hex: "#C9A778", pct: 0.45 },
      { hex: "#EEE1CC", pct: 0.2 },
    ],
  });

  const selected = selectOutfitReasoningPaletteV1(onePiece, [
    { hex: "#935234", source: "published_zone_authority" },
    { hex: "#C9A778", source: "global_palette" },
  ]);

  assert.deepEqual(selected.map((c) => c.hex), ["#935234"]);
  assert.equal(selected[0].ownership, "outfit");
  assert.ok(!selected.some((c) => ["#C9A778", "#EEE1CC"].includes(c.hex)));
});

test("published string hex values remain measurable positive ownership", () => {
  const result = buildSceneOwnershipV1({
    authoritativeGarmentZones: {
      zones: {
        upper_garment: {
          primary_color: "#935234",
        },
      },
    },
    normalizedColors: [{ hex: "#C9A778", pct: 0.9 }],
  });

  assert.deepEqual(result.outfit_palette.map((c) => c.hex), ["#935234"]);
  assert.ok(result.unknown_palette.some((c) => c.hex === "#C9A778"));
});
