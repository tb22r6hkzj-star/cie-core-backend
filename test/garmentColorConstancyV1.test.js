import test from "node:test";
import assert from "node:assert/strict";
import { estimateGarmentIntrinsicColorV1 } from "../src/intelligence/garmentColorConstancyV1.js";

const brownShirtSamples = [
  { hex: "#935234", pct: 0.42, ownership_state: "owned", pixel_count: 420 },
  { hex: "#763D25", pct: 0.34, ownership_state: "owned", pixel_count: 340 },
  { hex: "#502817", pct: 0.24, ownership_state: "owned", pixel_count: 240 },
];

test("same brown material remains one stable family across light and shadow", () => {
  const r = estimateGarmentIntrinsicColorV1(brownShirtSamples);
  assert.equal(r.available, true);
  assert.equal(r.stable_material_identity, true);
  assert.equal(r.illumination_variation_detected, true);
  assert.ok(r.support_ratio >= 0.9);
  assert.ok(brownShirtSamples.some((s) => s.hex.toUpperCase() === r.intrinsic_hex));
  assert.ok(r.samples.every((s) => s.same_material_family));
});

test("muted green material remains stable across ordinary light and shadow variation", () => {
  const samples = [
    { hex: "#3F5041", pct: 0.55, ownership_state: "owned" },
    { hex: "#57685B", pct: 0.30, ownership_state: "owned" },
    { hex: "#1D291F", pct: 0.15, ownership_state: "owned" },
  ];
  const r = estimateGarmentIntrinsicColorV1(samples);
  assert.equal(r.available, true);
  assert.equal(r.stable_material_identity, true);
  assert.ok(r.support_ratio >= 0.8);
  assert.ok(samples.some((s) => s.hex.toUpperCase() === r.intrinsic_hex));
});

test("scene/background colors cannot vote in intrinsic garment identity", () => {
  const r = estimateGarmentIntrinsicColorV1([
    ...brownShirtSamples,
    { hex: "#4E604F", pct: 0.6, ownership_state: "scene", pixel_count: 600 },
    { hex: "#C7B497", pct: 0.4, ownership_state: "background", pixel_count: 400 },
  ]);
  assert.equal(r.samples.length, 3);
  assert.ok(!r.samples.some((s) => s.hex === "#4E604F" || s.hex === "#C7B497"));
});

test("genuinely different chromatic evidence is not forced into one material family", () => {
  const r = estimateGarmentIntrinsicColorV1([
    { hex: "#935234", pct: 0.45, ownership_state: "owned" },
    { hex: "#763D25", pct: 0.35, ownership_state: "owned" },
    { hex: "#284B35", pct: 0.20, ownership_state: "owned" },
  ]);
  const green = r.samples.find((s) => s.hex === "#284B35");
  assert.equal(green.same_material_family, false);
});

test("intrinsic identity always resolves to an actually measured hex", () => {
  const r = estimateGarmentIntrinsicColorV1(brownShirtSamples);
  assert.ok(brownShirtSamples.map((s) => s.hex.toUpperCase()).includes(r.intrinsic_hex));
  assert.equal(r.policy.intrinsic_hex_must_be_measured_not_invented, true);
});
