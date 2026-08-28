import test from "node:test";
import assert from "node:assert/strict";

import { classifyMeasuredMetallicPaletteV1 } from "../src/intelligence/metallicColorIdentityV1.js";

test("publishes gold tone only from validated warm reflective object pixels", () => {
  const result = classifyMeasuredMetallicPaletteV1({
    validationSupported: true,
    highlightRatio: 0.08,
    colors: [
      { hex: "#7D5D43", pct: 0.34 },
      { hex: "#BEA082", pct: 0.31 },
      { hex: "#DDC3A1", pct: 0.25 },
    ],
  });
  assert.equal(result.publishable, true);
  assert.equal(result.family, "gold_tone_metal");
  assert.equal(result.display_name, "Gold Tone");
});

test("does not publish gold from an unvalidated skin-colored crop", () => {
  const result = classifyMeasuredMetallicPaletteV1({
    validationSupported: false,
    highlightRatio: 0.08,
    colors: [{ hex: "#B98269", pct: 0.8 }, { hex: "#E0B39A", pct: 0.2 }],
  });
  assert.equal(result.publishable, false);
  assert.equal(result.family, null);
});

test("does not mislabel neutral silver or black hardware as gold", () => {
  const result = classifyMeasuredMetallicPaletteV1({
    validationSupported: true,
    highlightRatio: 0.12,
    colors: [{ hex: "#D5D6D8", pct: 0.55 }, { hex: "#303236", pct: 0.45 }],
  });
  assert.equal(result.publishable, false);
});
