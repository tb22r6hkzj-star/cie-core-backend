import test from "node:test";
import assert from "node:assert/strict";

import { buildZoneColorBreakdownDisplay } from "../src/ui/garmentColorIdentity.js";

test("buildZoneColorBreakdownDisplay keeps zero pct region color as trace", () => {
  const breakdown = buildZoneColorBreakdownDisplay({
    dominant_color: { name: "Charcoal", hex: "#403D40", pct: 0.85 },
    primary_color: { name: "Charcoal", hex: "#403D40", pct: 0.85 },
    region_colors: [
      { name: "Charcoal", hex: "#403D40", pct: 0.85 },
      { name: "Stone Gray", hex: "#141013", pct: 0.14 },
      { name: "Rich Brown", hex: "#3C2111", pct: 0 },
    ],
  });

  assert.deepEqual(
    breakdown.colors.map(({ primaryLabel, hex, displayPercentage }) => ({ primaryLabel, hex, displayPercentage })),
    [
      { primaryLabel: "Charcoal", hex: "#403D40", displayPercentage: "85%" },
      { primaryLabel: "Stone Gray", hex: "#141013", displayPercentage: "14%" },
      { primaryLabel: "Rich Brown", hex: "#3C2111", displayPercentage: "trace" },
    ],
  );
  assert.equal(breakdown.colors.find((color) => color.hex === "#3C2111")?.displayPercentage, "trace");
  assert.notEqual(breakdown.colors.find((color) => color.hex === "#3C2111")?.displayPercentage, "100%");
});

test("buildZoneColorBreakdownDisplay dedupes support colors by hex after region evidence", () => {
  const breakdown = buildZoneColorBreakdownDisplay({
    region_colors: [{ name: "Charcoal", hex: "#403D40", pct: 0.85 }],
    support_colors: [
      { name: "Duplicate Charcoal", hex: "#403d40", pct: 0.9 },
      { name: "Stone Gray", hex: "#141013", pct: 0.14 },
    ],
  });

  assert.deepEqual(breakdown.colors.map((color) => color.hex), ["#403D40", "#141013"]);
  assert.equal(breakdown.colors[0].source, "region_colors");
});
