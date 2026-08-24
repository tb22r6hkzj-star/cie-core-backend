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

test("shadow mode records intrinsic evidence without changing publication", () => {
  const result = applyGarmentColorConstancyIntegrationV1(brownShirt, { mode: "shadow" });
  assert.equal(result.dominant_hex, "#763D25");
  assert.equal(result.color_debug.garment_color_constancy_v1.applied, false);
  assert.equal(result.color_debug.garment_color_constancy_v1.reason, "shadow_only_no_publication_change");
  assert.ok(result.color_debug.garment_color_constancy_v1.selected_intrinsic_hex);
});

test("assist mode promotes only a stable measured intrinsic hex", () => {
  const result = applyGarmentColorConstancyIntegrationV1(brownShirt, { mode: "assist" });
  const allowed = new Set(brownShirt.region_colors.map((row) => row.hex));
  assert.equal(result.color_debug.garment_color_constancy_v1.applied, true);
  assert.ok(allowed.has(result.dominant_hex));
  assert.equal(result.dominant_hex, result.color_debug.garment_color_constancy_v1.selected_intrinsic_hex);
});

test("unrelated green contamination cannot become the brown garment intrinsic identity", () => {
  const result = applyGarmentColorConstancyIntegrationV1({
    ...brownShirt,
    region_colors: [
      ...brownShirt.region_colors,
      { hex: "#4E604F", pct: 0.19, ownership_state: "scene", pixel_count: 190 },
    ],
  }, { mode: "assist" });
  assert.notEqual(result.dominant_hex, "#4E604F");
});

test("non-garment regions are never changed", () => {
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
