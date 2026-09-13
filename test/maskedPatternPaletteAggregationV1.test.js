import test from "node:test";
import assert from "node:assert/strict";
import { aggregateMeasuredMaskColorsV1 } from "../src/intelligence/maskedPatternPaletteAggregationV1.js";

test("distributed pattern buckets aggregate before palette limiting", () => {
  const dark = Array.from({ length: 6 }, (_, index) => ({
    hex: ["#221F1D", "#292522", "#302A26", "#26221F", "#342C27", "#1D1B1A"][index],
    pixel_count: 90 - index * 5,
  }));
  const taupe = [
    { hex: "#77685D", pixel_count: 48 },
    { hex: "#806F62", pixel_count: 46 },
    { hex: "#706157", pixel_count: 44 },
  ];
  const palette = aggregateMeasuredMaskColorsV1([...dark, ...taupe], 6);
  assert.ok(palette.some((color) => color.family !== palette[0].family));
  assert.ok(palette.some((color) => color.pixel_count >= 130));
  assert.ok(Math.abs(palette.reduce((sum, color) => sum + color.pct, 0) - 1) < 0.001);
});

test("a low-mass color repeated across a garment retains spatial pattern evidence", () => {
  const cells = ["0_0", "1_1", "2_2", "3_3", "4_4", "5_5", "6_6", "7_7"];
  const palette = aggregateMeasuredMaskColorsV1([
    { hex: "#29231F", pixel_count: 920, spatial_cells: cells, spatial_grid_cell_count: 64, ownership_validated: true },
    { hex: "#75675C", pixel_count: 30, spatial_cells: cells.slice(0, 4), spatial_grid_cell_count: 64, ownership_validated: true },
    { hex: "#806F62", pixel_count: 28, spatial_cells: cells.slice(4), spatial_grid_cell_count: 64, ownership_validated: true },
  ]);
  const repeated = palette.find((row) => row.family !== palette[0].family);
  assert.ok(repeated);
  assert.ok(repeated.pct < 0.18);
  assert.equal(repeated.pattern_repetition_supported, true);
  assert.equal(repeated.ownership_validated, true);
  assert.equal(repeated.spatial_cell_count, 8);
});
