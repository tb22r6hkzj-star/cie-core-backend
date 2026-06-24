import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDetectedColorDisplayRows,
  buildGarmentZoneColorDisplay,
  buildVisionCoreColorCardSections,
} from "../src/ui/garmentColorIdentity.js";

test("detected colors preserve original order and trace percentages", () => {
  const zone = {
    region_colors: [
      { hex: "#403D40", name: "Charcoal", pct: 0.85 },
      { hex: "#141013", name: "Stone Gray", pct: 0.14 },
      { hex: "#3C2111", name: "Rich Brown", pct: 0 },
    ],
  };

  assert.deepEqual(
    buildDetectedColorDisplayRows(zone).map((row) => [row.primaryLabel, row.percentage]),
    [
      ["Charcoal", "85%"],
      ["Stone Gray", "14%"],
      ["Rich Brown", "Trace"],
    ]
  );
});

test("color card sections render interpretation before evidence", () => {
  const zone = {
    dominant_color: { hex: "#403D40", name: "Charcoal", pct: 0.85 },
    primary_color: { hex: "#403D40", name: "Charcoal", pct: 0.85 },
    signature_color: {
      hex: "#8A8580",
      name: "Stone Gray",
      reason: "Dominant color differs from finalized primary color and provides useful display context.",
    },
    secondary_colors: [{ hex: "#C9B8A6", name: "Soft Sand" }],
    accent_colors: [{ hex: "#3C2111", name: "Rich Brown" }],
    region_colors: [
      { hex: "#403D40", name: "Charcoal", pct: 0.85 },
      { hex: "#141013", name: "Stone Gray", pct: 0.14 },
      { hex: "#3C2111", name: "Rich Brown", pct: 0 },
    ],
  };

  const sections = buildVisionCoreColorCardSections(zone);
  assert.deepEqual(sections.map((section) => section.key), [
    "identity",
    "signature_color",
    "secondary_colors",
    "accent_colors",
    "detected_colors",
  ]);
  assert.equal(sections.at(-1).variant, "evidence");
  assert.equal(sections.at(-1).rows.at(-1).percentage, "Trace");
});

test("accessory-style displays include card sections and detected colors", () => {
  const display = buildGarmentZoneColorDisplay({
    color_mode: "single_color",
    dominant_color: { hex: "#403D40", name: "Charcoal" },
    primary_color: { hex: "#403D40", name: "Charcoal" },
    signature_color: { hex: "#141013", name: "Stone Gray" },
    colorBreakdown: [
      { hex: "#403D40", name: "Charcoal", percentage: "85%" },
      { hex: "#141013", name: "Stone Gray", percentage: "14%" },
      { hex: "#3C2111", name: "Rich Brown", pct: 0 },
    ],
  });

  assert.equal(display.mode, "single_color");
  assert.deepEqual(display.detected_colors.map((row) => row.percentage), ["85%", "14%", "Trace"]);
  assert.ok(display.card_sections.some((section) => section.key === "signature_color"));
  assert.ok(display.card_sections.some((section) => section.key === "detected_colors"));
});
