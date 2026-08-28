import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

process.env.NODE_ENV = "test";
delete process.env.PERCEPTION_V6_MODE;
const { buildOutfitAnalysis, MARKET_PERCEPTION_V6_MODE } = await import("../src/server.js");

const base = {
  dominantHex: "#334455",
  topColors: [
    { hex: "#334455", pct: 0.7 },
    { hex: "#eeeeee", pct: 0.3 },
  ],
  segmentedRegions: [],
};

test("market API perception mode defaults to assist", () => {
  assert.equal(MARKET_PERCEPTION_V6_MODE, "assist");
});

test("library buildOutfitAnalysis default remains shadow for compatibility", () => {
  const result = buildOutfitAnalysis(base);
  assert.equal(result.perception_v6_mode, "shadow");
});

test("all market-facing analysis routes explicitly use the market perception mode", () => {
  const source = fs.readFileSync(new URL("../src/server.js", import.meta.url), "utf8");
  const matches = source.match(/perception_v6_mode:\s*MARKET_PERCEPTION_V6_MODE/g) || [];
  assert.equal(matches.length, 4);
});
