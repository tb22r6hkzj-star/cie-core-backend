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
