import test from "node:test";
import assert from "node:assert/strict";

process.env.NODE_ENV = "test";

const { buildOutfitAnalysis } = await import("../src/server.js");

const personContaminationColors = [
  { hex: "#F0C2A0", pct: 0.62, name: "Skin" },
  { hex: "#FFFFFF", pct: 0.2, name: "White Background" },
  { hex: "#0000FF", pct: 0.18, name: "Blue Garment" },
];

function buildAnalysisWithDinoRegions(dinoRegions) {
  return buildOutfitAnalysis({
    dominantHex: "#F0C2A0",
    topColors: personContaminationColors,
    segmentedRegions: dinoRegions,
    dinoGarmentRegions: [],
    pipeline: { sam_enabled: false, dino_enabled: true },
  });
}

function buildMixedEyewear({ refinedColors, dinoColors }) {
  return buildOutfitAnalysis({
    dominantHex: "#F0C2A0",
    topColors: personContaminationColors,
    segmentedRegions: [
      {
        id: "refined_eyewear_crop",
        source_type: "sam_segment",
        zone: "eyewear",
        label: "eyewear",
        segment_label: "eyewear",
        dominant_hex: refinedColors[0]?.hex,
        confidence: 0.96,
        coverage: 0.14,
        region_colors: refinedColors,
      },
      {
        id: "raw_dino_eyewear",
        source_type: "grounding_dino",
        zone: "eyewear",
        label: "eyewear",
        segment_label: "eyewear",
        dominant_hex: dinoColors[0]?.hex,
        confidence: 0.93,
        coverage: 0.05,
        region_colors: dinoColors,
      },
    ],
    dinoGarmentRegions: [],
    pipeline: { sam_enabled: true, dino_enabled: true },
  });
}

test("eyewear DINO object palette survives finalized single_color zone", () => {
  const analysis = buildAnalysisWithDinoRegions([
    {
      id: "eyewear_fixture",
      source_type: "grounding_dino",
      zone: "eyewear",
      label: "eyewear",
      segment_label: "eyewear",
      dominant_hex: "#403D40",
      confidence: 0.91,
      coverage: 0.04,
      region_colors: [
        { hex: "#403D40", pct: 0.85, name: "Charcoal" },
        { hex: "#141013", pct: 0.14, name: "Stone Gray" },
        { hex: "#3C2111", pct: 0, name: "Rich Brown" },
        { hex: "#7B655F", pct: 0, name: "Dusty Rose" },
      ],
    },
    {
      id: "upper_contaminant",
      source_type: "grounding_dino",
      zone: "upper_garment",
      label: "shirt",
      segment_label: "shirt",
      dominant_hex: "#0000FF",
      confidence: 0.9,
      coverage: 0.32,
      region_colors: [{ hex: "#0000FF", pct: 0.8, name: "Blue" }],
    },
  ]);

  const zone = analysis.garment_zones.zones.eyewear;
  const expectedHexes = ["#403D40", "#141013", "#3C2111", "#7B655F"];

  assert.equal(zone.color_mode, "single_color");
  assert.deepEqual(zone.region_colors.map((c) => c.hex), expectedHexes);
  assert.deepEqual(zone.detected_colors.map((c) => c.hex), expectedHexes);
  assert.equal(zone.region_colors[0].pct, 0.85);
  assert.notEqual(zone.region_colors[0].pct, 1);
  assert.equal(zone.secondary_colors[0].hex, "#141013");
  assert.ok(["Jet Black", "Near Black", "Deep Black", "Graphite Black"].includes(zone.secondary_colors[0].name));
  assert.deepEqual(zone.accent_colors.map((c) => c.hex), ["#3C2111", "#7B655F"]);
  assert.equal(zone.accent_colors[0].pct, 0);
  assert.equal(zone.display_palette_trace.selected_source, "candidate_region");
  assert.equal(zone.raw_dino_palette[0].pct, 0.85);
  assert.equal(zone.raw_dino_palette[2].pct, 0);
  assert.ok(!zone.region_colors.some((c) => c.hex === "#0000FF" || c.hex === "#F0C2A0" || c.hex === "#FFFFFF"));
});

test("headwear accessory_jewelry DINO object palette survives without dominant inflation", () => {
  const analysis = buildAnalysisWithDinoRegions([
    {
      id: "headwear_fixture",
      source_type: "grounding_dino",
      zone: "accessory_jewelry",
      label: "hat",
      segment_label: "hat",
      category: "hat",
      accessory_type: "headwear",
      dominant_hex: "#201E1D",
      confidence: 0.93,
      coverage: 0.08,
      region_colors: [
        { hex: "#201E1D", pct: 0.78, name: "Graphite Black" },
        { hex: "#604A41", pct: 0.2, name: "Brick Red" },
        { hex: "#8F7C72", pct: 0.01, name: "Stone Gray" },
      ],
    },
    {
      id: "lower_contaminant",
      source_type: "grounding_dino",
      zone: "lower_garment",
      label: "pants",
      segment_label: "pants",
      dominant_hex: "#FFFFFF",
      confidence: 0.9,
      coverage: 0.28,
      region_colors: [{ hex: "#FFFFFF", pct: 0.9, name: "White" }],
    },
  ]);

  const zone = analysis.garment_zones.zones.accessory_jewelry;

  assert.deepEqual(zone.region_colors.map((c) => c.hex), ["#201E1D", "#604A41", "#8F7C72"]);
  assert.deepEqual(zone.detected_colors.map((c) => c.hex), ["#201E1D", "#604A41", "#8F7C72"]);
  assert.equal(zone.region_colors[0].pct, 0.78);
  assert.notEqual(zone.region_colors[0].pct, 1);
  assert.equal(zone.secondary_colors[0].hex, "#604A41");
  assert.ok(zone.region_colors.some((c) => c.name === "Brick Red" && c.pct === 0.2));
  assert.equal(zone.display_palette_trace.selected_source, "candidate_region");
  assert.ok(!zone.region_colors.some((c) => c.hex === "#FFFFFF" || c.hex === "#F0C2A0"));
});

test("WP-04 refined crop wins over raw DINO skin and glare evidence", () => {
  const analysis = buildMixedEyewear({
    refinedColors: [
      { hex: "#5A3522", pct: 0.72, name: "Brown" },
      { hex: "#3C2111", pct: 0.18, name: "Rich Brown" },
      { hex: "#FFFFFF", pct: 0.1, name: "White Glare" },
    ],
    dinoColors: [
      { hex: "#D8A27E", pct: 0.83, name: "Skin" },
      { hex: "#F5F1ED", pct: 0.17, name: "Glare" },
    ],
  });
  const zone = analysis.garment_zones.zones.eyewear;
  assert.equal(zone.display_palette_trace.selected_source, "refined_crop");
  assert.equal(zone.display_palette_trace.reason_not_replaced, "higher_priority_confirmed_values_are_authoritative");
  assert.deepEqual(zone.display_palette.map((c) => c.hex), ["#5A3522", "#3C2111"]);
  assert.equal(zone.primary_color.hex, "#5A3522");
  assert.ok(!zone.display_palette.some((c) => ["#D8A27E", "#F5F1ED", "#FFFFFF"].includes(c.hex)));
  assert.ok(zone.raw_dino_palette.some((c) => c.hex === "#D8A27E"));
});

test("WP-04 brown eyewear identity survives while beige-shirt-like evidence cannot replace it", () => {
  const analysis = buildMixedEyewear({
    refinedColors: [
      { hex: "#6A4028", pct: 0.81, name: "Brown" },
      { hex: "#3C2111", pct: 0, name: "Rich Brown" },
    ],
    dinoColors: [{ hex: "#C9A47D", pct: 0.9, name: "Warm Beige" }],
  });
  const zone = analysis.garment_zones.zones.eyewear;
  assert.equal(zone.primary_color.hex, "#6A4028");
  assert.ok(zone.display_palette.some((c) => c.hex === "#3C2111" && c.pct === 0));
  assert.ok(!zone.display_palette.some((c) => c.hex === "#C9A47D"));
});

test("WP-04 dark sunglasses remain publishable on dark skin", () => {
  const analysis = buildMixedEyewear({
    refinedColors: [
      { hex: "#111214", pct: 0.86, name: "Black Frame" },
      { hex: "#2A2B2F", pct: 0.14, name: "Dark Lens" },
    ],
    dinoColors: [{ hex: "#6B493D", pct: 0.88, name: "Skin" }],
  });
  const zone = analysis.garment_zones.zones.eyewear;
  assert.equal(zone.display_palette_trace.selected_source, "refined_crop");
  assert.equal(zone.primary_color.hex, "#111214");
  assert.ok(zone.display_palette.every((c) => ["#111214", "#2A2B2F"].includes(c.hex)));
});
