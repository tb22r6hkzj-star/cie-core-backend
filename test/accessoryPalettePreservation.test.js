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
  assert.ok(!zone.region_colors.some((c) => c.hex === "#FFFFFF" || c.hex === "#F0C2A0"));
});
