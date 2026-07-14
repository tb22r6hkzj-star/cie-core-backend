import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDetectedColorDisplayRows,
  buildDetectedPaletteDisplay,
  collectDetectedRegionColors,
  buildGarmentZoneColorDisplay,
  buildVisionCoreColorCardSections,
} from "../src/ui/garmentColorIdentity.js";

const expectedSectionTitles = [
  "Color Identity",
  "Signature Color",
  "Secondary Colors",
  "Accent Colors",
  "Detected Palette",
];

function sectionTitles(display) {
  return display.card_sections.map((section) => section.title);
}

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

test("single-color and multicolor displays include detected colors and ordered card sections", () => {
  const baseZone = {
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

  const singleColorDisplay = buildGarmentZoneColorDisplay({ ...baseZone, color_mode: "single_color" });
  const multicolorDisplay = buildGarmentZoneColorDisplay({ ...baseZone, color_mode: "multicolor" });

  for (const display of [singleColorDisplay, multicolorDisplay]) {
    assert.ok(display.detected_colors.length > 0);
    assert.ok(display.detectedPalette.length > 0);
    assert.deepEqual(sectionTitles(display), expectedSectionTitles);
    assert.deepEqual(display.card_sections.map((section) => section.key), [
      "identity",
      "signature_color",
      "secondary_colors",
      "accent_colors",
      "detected_colors",
    ]);
    assert.equal(display.card_sections.at(-1).variant, "evidence");
    assert.equal(display.card_sections.at(-1).rows.at(-1).percentage, "Trace");
  }
});

test("signature color renders when present", () => {
  const sections = buildVisionCoreColorCardSections({
    dominant_color: { hex: "#403D40", name: "Charcoal" },
    signature_color: { hex: "#8A8580", name: "Stone Gray", reason: "Visible secondary cue." },
  });

  const signatureSection = sections.find((section) => section.title === "Signature Color");
  assert.ok(signatureSection);
  assert.equal(signatureSection.rows[0].primaryLabel, "Stone Gray");
  assert.equal(signatureSection.reason, "Visible secondary cue.");
});

test("segmented region colors take priority over collapsed zone region colors", () => {
  const zone = {
    segmented_regions: [
      {
        label: "eyewear",
        region_colors: [
          { hex: "#403D40", name: "Charcoal", pct: 0.85 },
          { hex: "#8A8580", name: "Stone Gray", pct: 0.14 },
        ],
      },
    ],
    region_colors: [{ hex: "#403D40", name: "Charcoal", pct: 1 }],
  };

  assert.deepEqual(
    collectDetectedRegionColors(zone).map((color) => `${color.name} ${color.pct}`),
    ["Charcoal 0.85", "Stone Gray 0.14"]
  );
});

test("eyewear detected palette displays raw DINO region colors", () => {
  const eyewearZone = {
    color_mode: "single_color",
    primary_color: { hex: "#403D40", name: "Charcoal" },
    region_colors: [{ hex: "#403D40", name: "Charcoal", pct: 1 }],
    segmented_regions: [
      {
        source_type: "grounding_dino",
        label: "eyewear",
        region_colors: [
          { hex: "#403D40", name: "Charcoal", pct: 0.85 },
          { hex: "#8A8580", name: "Stone Gray", pct: 0.14 },
          { hex: "#3C2111", name: "Rich Brown", pct: 0 },
          { hex: "#B98C90", name: "Dusty Rose", percentage: 0 },
        ],
      },
    ],
  };

  assert.deepEqual(
    buildDetectedPaletteDisplay(eyewearZone).map((row) => `${row.primaryLabel} ${row.percentage}`),
    ["Charcoal 85%", "Stone Gray 14%", "Rich Brown Trace", "Dusty Rose Trace"]
  );

  const display = buildGarmentZoneColorDisplay(eyewearZone);
  const detectedPaletteSection = display.card_sections.find((section) => section.key === "detected_colors");

  assert.equal(detectedPaletteSection.title, "Detected Palette");
  assert.deepEqual(
    display.detectedPalette.map((row) => `${row.primaryLabel} ${row.percentage}`),
    ["Charcoal 85%", "Stone Gray 14%", "Rich Brown Trace", "Dusty Rose Trace"]
  );
});

test("headwear detected palette displays raw region colors", () => {
  const headwearZone = {
    color_mode: "single_color",
    primary_color: { hex: "#101010", name: "Graphite Black" },
    regions: [
      {
        label: "headwear",
        colors: [
          { hex: "#101010", name: "Graphite Black", pct: 0.78 },
          { hex: "#8B2F24", name: "Brick Red", pct: 0.2 },
          { hex: "#8A8580", name: "Stone Gray", pct: 0.01 },
        ],
      },
    ],
  };

  assert.deepEqual(
    buildDetectedColorDisplayRows(headwearZone).map((row) => `${row.primaryLabel} ${row.percentage}`),
    ["Graphite Black 78%", "Brick Red 20%", "Stone Gray 1%"]
  );
});

test("falls back to zone region colors when segmented regions are unavailable", () => {
  const zone = {
    region_colors: [
      { hex: "#403D40", name: "Charcoal", pct: 0.85 },
      { hex: "#8A8580", name: "Stone Gray", pct: 0.14 },
    ],
  };

  assert.deepEqual(
    buildDetectedColorDisplayRows(zone).map((row) => `${row.primaryLabel} ${row.percentage}`),
    ["Charcoal 85%", "Stone Gray 14%"]
  );
});

test("tiny detected values render as Trace rather than 0%", () => {
  const zone = {
    detectedPalette: [{ hex: "#B98C90", name: "Dusty Rose", pct: 0.004 }],
  };

  assert.equal(buildDetectedPaletteDisplay(zone)[0].percentage, "Trace");
});
