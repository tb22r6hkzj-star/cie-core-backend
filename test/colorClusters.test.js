import test from "node:test";
import assert from "node:assert/strict";

process.env.NODE_ENV = "test";

const { buildColorClusters } = await import("../src/server.js");

test("buildColorClusters does not inflate explicit zero pct eyewear swatches", () => {
  const clusters = buildColorClusters([
    { hex: "#403D40", pct: 0.85 },
    { hex: "#141013", pct: 0.14 },
    { hex: "#3C2111", pct: 0 },
  ]);

  assert.ok(clusters.length > 0);
  assert.notEqual(clusters[0].base, "#3C2111");
  assert.ok(["#403D40", "#141013"].includes(clusters[0].base));
});
