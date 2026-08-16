import test from "node:test";
import assert from "node:assert/strict";

process.env.NODE_ENV = "test";
const { buildOutfitAnalysis } = await import("../src/server.js");

const base = {
  dominantHex: "#222831",
  topColors: [
    { hex: "#222831", pct: 0.7 },
    { hex: "#d8d8d8", pct: 0.3 },
  ],
};

function headwearCandidate({ id, hex, pct, confidence = 0.9 }) {
  return {
    id,
    source_type: "grounding_dino",
    zone: "accessory_jewelry",
    label: "hat",
    segment_label: "hat",
    display_zone_label: "Headwear",
    accessory_type: "headwear",
    object_type: "hat",
    confidence,
    coverage: 0.12,
    bbox: [0.25, 0.05, 0.5, 0.2],
    dominant_hex: hex,
    region_colors: [{ hex, pct }],
  };
}

const mutedSkinLike = headwearCandidate({
  id: "dino_4",
  hex: "#a97878",
  pct: 0.78,
  confidence: 0.93,
});

const saturatedObject = headwearCandidate({
  id: "dino_5",
  hex: "#1457b8",
  pct: 0.58,
  confidence: 0.91,
});

function run(regions) {
  return buildOutfitAnalysis({
    ...base,
    segmentedRegions: regions,
    perception_v6_mode: "shadow",
  });
}

test("WP-03 candidate hardening promotes saturated headwear object evidence over muted skin-like evidence", () => {
  const result = run([mutedSkinLike, saturatedObject]);
  const zone = result.garment_zones.zones.accessory_jewelry;
  const selection = zone?._debug?.dino_primary_region_selection;

  assert.ok(zone);
  assert.equal(selection?.selected_id, "dino_5");
  assert.equal(selection?.selected_dominant_hex?.toLowerCase(), "#1457b8");
  assert.equal(selection?.reason, "selected_highest_scoring_headwear_dino_candidate");
});

test("WP-03 preserves the winning DINO dominant color through zone inference", () => {
  const result = run([mutedSkinLike, saturatedObject]);
  const zone = result.garment_zones.zones.accessory_jewelry;

  assert.equal(zone?._debug?.preservedDinoHex?.toLowerCase(), "#1457b8");
  assert.equal(zone?._debug?.dominant_color_selection?.preserved_dino_hex?.toLowerCase(), "#1457b8");
  assert.equal(zone?.dominant_color?.hex?.toLowerCase(), "#1457b8");
});

test("WP-03 lifecycle trace retains stage-level dominant-color diagnostics", () => {
  const result = run([mutedSkinLike, saturatedObject]);
  const trace = result.dino_lifecycle_trace;

  assert.equal(trace?.target_id, "dino_4");
  assert.ok(Array.isArray(trace?.stages));
  assert.ok(trace.stages.some((stage) => stage.stage === "garmentEvidenceRegions" && stage.found));
  assert.ok(trace.stages.every((stage) => Object.hasOwn(stage, "dominant_hex")));
  assert.ok(trace.change_summary);
  assert.ok(Object.hasOwn(trace.change_summary, "changed_between"));
  assert.ok(Object.hasOwn(trace.change_summary, "same_object_ref"));
});
