import test from "node:test";
import assert from "node:assert/strict";

process.env.NODE_ENV = "test";
const { inferZoneColorRead } = await import("../src/server.js");

const rawShirtPalette = [
  { hex: "#763D25", pct: 0.22, source: "upper_garment_purity_v1" },
  { hex: "#526455", pct: 0.19 },
  { hex: "#1E0D07", pct: 0.11 },
  { hex: "#C17D5A", pct: 0.09 },
  { hex: "#935234", pct: 0.02 },
];

test("unowned DINO shades cannot force a garment into multicolor publication", () => {
  const result = inferZoneColorRead(
    "upper_garment",
    { hex: "#763D25", name: "Rich Brown", pct: 1, score: 83, confidence: 83 },
    [],
    rawShirtPalette,
    true,
    {
      preserveDinoZoneColor: true,
      preservedDinoHex: "#763D25",
      selectedDinoRegionColors: rawShirtPalette,
      rawDinoRegionColors: rawShirtPalette,
      zoneColorSource: "dino_primary",
      evidence: { coverage: 0.46, weighted_confidence: 0.83, color_count: 5 },
    }
  );

  assert.equal(result.color_mode, "single_color");
  assert.equal(result.primary_color.hex, "#763D25");
  assert.deepEqual(result.secondary_colors, []);
  assert.deepEqual(result.accent_colors, []);
  assert.deepEqual(result.detected_colors.map((color) => color.hex), ["#763D25"]);
  assert.equal(result._debug.raw_dino_multicolor_reason, null);
  assert.equal(result._debug.garment_publication_authority_v1.suppressed_unowned_color_count, 4);
});

test("a spatially owned garment-body secondary remains eligible for publication", () => {
  const palette = [
    { hex: "#60321E", pct: 0.62, source: "upper_garment_purity_v1", body_share: 0.72, boundary_share: 0.08, underarm_share: 0.05, spatial_penalty: 1 },
    { hex: "#D5C2A8", pct: 0.38, source: "upper_garment_purity_v1", body_share: 0.64, boundary_share: 0.12, underarm_share: 0.08, spatial_penalty: 1 },
  ];
  const result = inferZoneColorRead(
    "upper_garment",
    { hex: "#60321E", name: "Rich Brown", pct: 0.62, score: 88, confidence: 88 },
    [],
    palette,
    true,
    {
      preserveDinoZoneColor: true,
      preservedDinoHex: "#60321E",
      selectedDinoRegionColors: palette,
      rawDinoRegionColors: palette,
      zoneColorSource: "dino_primary",
      evidence: { coverage: 0.8, weighted_confidence: 0.88, color_count: 2 },
    }
  );

  assert.equal(result._debug.garment_publication_authority_v1.owned_secondary_count, 1);
  assert.ok(result.detected_colors.some((color) => color.hex === "#D5C2A8"));
});

test("one owned secondary never reopens the entire raw DINO garment palette", () => {
  const palette = [
    { hex: "#935234", pct: 0.58, source: "upper_garment_purity_v1", body_share: 0.75, boundary_share: 0.08, underarm_share: 0.05, spatial_penalty: 1 },
    { hex: "#D5C2A8", pct: 0.21, source: "upper_garment_purity_v1", body_share: 0.65, boundary_share: 0.12, underarm_share: 0.08, spatial_penalty: 1 },
    { hex: "#526455", pct: 0.19 },
    { hex: "#1E0D07", pct: 0.11 },
  ];
  const result = inferZoneColorRead(
    "upper_garment",
    { hex: "#935234", name: "Rich Brown", pct: 0.58, score: 88, confidence: 88 },
    [],
    palette,
    true,
    {
      preserveDinoZoneColor: true,
      preservedDinoHex: "#935234",
      selectedDinoRegionColors: palette,
      rawDinoRegionColors: palette,
      zoneColorSource: "dino_primary",
      evidence: { coverage: 0.8, weighted_confidence: 0.88, color_count: 4 },
    }
  );

  const published = result.detected_colors.map((color) => color.hex);
  assert.ok(published.includes("#935234"));
  assert.ok(published.includes("#D5C2A8"));
  assert.ok(!published.includes("#526455"));
  assert.ok(!published.includes("#1E0D07"));
});

test("owned light and shadow shades of one brown material do not create multicolor", () => {
  const palette = [
    { hex: "#935234", pct: 0.56, ownership_state: "owned", ownership_validated: true },
    { hex: "#763D25", pct: 0.27, ownership_state: "owned", ownership_validated: true },
    { hex: "#502817", pct: 0.17, ownership_state: "owned", ownership_validated: true },
  ];
  const result = inferZoneColorRead(
    "upper_garment",
    { hex: "#935234", name: "Rich Brown", pct: 0.56, score: 90, confidence: 90 },
    [],
    palette,
    true,
    { preserveDinoZoneColor: true, preservedDinoHex: "#935234", rawDinoRegionColors: palette, zoneColorSource: "dino_primary" }
  );

  assert.equal(result.color_mode, "single_color");
  assert.deepEqual(result.detected_colors.map((color) => color.hex), ["#935234"]);
});
