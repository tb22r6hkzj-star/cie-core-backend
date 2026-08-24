import test from "node:test";
import assert from "node:assert/strict";
import {
  applyGarmentColorConstancyIntegrationV1,
  applyGarmentColorConstancyToRegionsV1,
} from "../src/intelligence/garmentColorConstancyIntegrationV1.js";

const brownShirt = {
  zone: "upper_garment",
  dominant_hex: "#763D25",
  region_colors: [
    { hex: "#935234", pct: 0.42, ownership_state: "owned", pixel_count: 420 },
    { hex: "#763D25", pct: 0.34, ownership_state: "owned", pixel_count: 340 },
    { hex: "#502817", pct: 0.24, ownership_state: "owned", pixel_count: 240 },
  ],
};

test("off mode performs no intrinsic estimation and changes no publication", () => {
  const result = applyGarmentColorConstancyIntegrationV1(brownShirt, { mode: "off" });
  const debug = result.color_debug.garment_color_constancy_v1;
  assert.equal(result.dominant_hex, "#763D25");
  assert.equal(result.region_colors.length, 3);
  assert.equal(debug.mode, "off");
  assert.equal(debug.applied, false);
  assert.equal(debug.reason, "disabled");
  assert.equal(debug.selected_intrinsic_hex, null);
  assert.equal(debug.intrinsic, null);
  assert.equal(debug.policy.off_mode_performs_no_intrinsic_estimation, true);
});

test("shadow mode records intrinsic evidence without changing publication", () => {
  const result = applyGarmentColorConstancyIntegrationV1(brownShirt, { mode: "shadow" });
  assert.equal(result.dominant_hex, "#763D25");
  assert.equal(result.region_colors.length, 3);
  assert.equal(result.color_debug.garment_color_constancy_v1.applied, false);
  assert.equal(result.color_debug.garment_color_constancy_v1.reason, "shadow_only_no_publication_change");
  assert.ok(result.color_debug.garment_color_constancy_v1.selected_intrinsic_hex);
  assert.ok(result.color_debug.garment_color_constancy_v1.intrinsic);
});

test("assist mode promotes one stable measured intrinsic color into the publishable lane", () => {
  const result = applyGarmentColorConstancyIntegrationV1(brownShirt, { mode: "assist" });
  const allowed = new Set(brownShirt.region_colors.map((row) => row.hex));
  assert.equal(result.color_debug.garment_color_constancy_v1.applied, true);
  assert.ok(allowed.has(result.dominant_hex));
  assert.equal(result.dominant_hex, result.color_debug.garment_color_constancy_v1.selected_intrinsic_hex);
  assert.equal(result.region_colors.length, 1);
  assert.equal(result.region_colors[0].hex, result.dominant_hex);
  assert.equal(result.region_colors[0].pct, 1);
  assert.equal(result.region_colors[0].intrinsic_material_identity, true);
  assert.equal(result.color_debug.garment_color_constancy_v1.raw_region_colors.length, 3);
});

test("assist mode cannot promote samples that lack explicit ownership", () => {
  const result = applyGarmentColorConstancyIntegrationV1({
    ...brownShirt,
    region_colors: brownShirt.region_colors.map(({ ownership_state, ...row }) => row),
  }, { mode: "assist" });
  const debug = result.color_debug.garment_color_constancy_v1;
  assert.equal(debug.applied, false);
  assert.equal(debug.selected_intrinsic_hex, null);
  assert.equal(debug.intrinsic.available, false);
  assert.equal(debug.intrinsic.reason, "no_explicitly_owned_measured_colors");
  assert.equal(result.dominant_hex, "#763D25");
  assert.equal(result.region_colors.length, 3);
});

test("unrelated green contamination stays diagnostic and cannot enter the publishable brown palette", () => {
  const result = applyGarmentColorConstancyIntegrationV1({
    ...brownShirt,
    region_colors: [
      ...brownShirt.region_colors,
      { hex: "#4E604F", pct: 0.19, ownership_state: "scene", pixel_count: 190 },
    ],
  }, { mode: "assist" });
  assert.notEqual(result.dominant_hex, "#4E604F");
  assert.equal(result.region_colors.length, 1);
  assert.notEqual(result.region_colors[0].hex, "#4E604F");
  assert.ok(result.color_debug.garment_color_constancy_v1.raw_region_colors.some((row) => row.hex === "#4E604F"));
});

test("same-material light and shadow variants do not publish as separate garment colors", () => {
  const result = applyGarmentColorConstancyIntegrationV1(brownShirt, { mode: "assist" });
  const published = new Set(result.region_colors.map((row) => row.hex));
  assert.equal(published.size, 1);
  assert.ok(result.color_debug.garment_color_constancy_v1.raw_region_colors.some((row) => row.hex === "#763D25"));
  assert.ok(result.color_debug.garment_color_constancy_v1.raw_region_colors.some((row) => row.hex === "#502817"));
});

test("non-garment regions are never promoted", () => {
  const result = applyGarmentColorConstancyIntegrationV1({
    zone: "background",
    dominant_hex: "#123456",
    region_colors: [{ hex: "#654321", ownership_state: "owned" }],
  }, { mode: "assist" });
  assert.equal(result.dominant_hex, "#123456");
  assert.equal(result.color_debug.garment_color_constancy_v1.applied, false);
});

test("batch integration preserves region count", () => {
  const rows = applyGarmentColorConstancyToRegionsV1([brownShirt, { zone: "background", dominant_hex: "#111111" }], { mode: "shadow" });
  assert.equal(rows.length, 2);
});
