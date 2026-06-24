import test from "node:test";
import assert from "node:assert/strict";

import { buildGarmentZoneColorDisplay } from "../src/ui/garmentColorIdentity.js";

test("eyewear detected palette preserves raw DINO region colors as supporting evidence", () => {
  const display = buildGarmentZoneColorDisplay({
    zone: "eyewear",
    color_mode: "single_color",
    dominant_color: { hex: "#403D40", name: "Charcoal", pct: 0.85 },
    primary_color: { hex: "#403D40", name: "Charcoal", pct: 0.85 },
    region_colors: [
      { hex: "#403D40", name: "Charcoal", pct: 0.85 },
      { hex: "#141013", name: "Stone Gray", pct: 0.14 },
      { hex: "#3C2111", name: "Rich Brown", pct: 0 },
      { hex: "#7B655F", name: "Dusty Rose", pct: 0 },
    ],
  });

  assert.equal(display.colors[0].hex, "#403D40");
  assert.equal(display.detectedPalette.title, "Detected Palette");
  assert.deepEqual(display.detectedPalette.colors.map((c) => c.hex), ["#403D40", "#141013", "#3C2111", "#7B655F"]);
  assert.deepEqual(display.detectedPalette.colors.map((c) => c.percentage), ["85%", "14%", "Trace", "Trace"]);
});
