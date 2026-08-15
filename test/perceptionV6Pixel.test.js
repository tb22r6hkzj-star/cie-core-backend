import test from "node:test";
import assert from "node:assert/strict";
import { analyzePerceptionV5 } from "../src/intelligence/perceptionV5/index.js";
import { analyzePerceptionV6 } from "../src/intelligence/perceptionV6/index.js";

process.env.NODE_ENV = "test";
const { buildOutfitAnalysis } = await import("../src/server.js");

const palette = [{ hex: "#4b2e20", pct: .7 }, { hex: "#eeeeee", pct: .3 }];
const eyewear = { id: "glasses-v6", source_type: "grounding_dino", zone: "eyewear", label: "brown glasses", confidence: .96, coverage: .4, bbox: [0, 0, 1, 1] };

function rgbaImage(colors, width = colors.length) {
  return { width, height: 1, data: Uint8Array.from(colors.flatMap((hex) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16), 255])) };
}

test("authoritative publication is enriched from the selected V6 reconciliation", () => {
  const decodedImage = rgbaImage(["#4b2e20", "#4b2e20", "#4b2e20", "#4b2e20"]);
  const result = buildOutfitAnalysis({ dominantHex: "#4b2e20", topColors: palette, segmentedRegions: [eyewear], decodedImage, v6_mode: "authoritative" });
  const published = result.garment_zones.zones.eyewear;
  assert.equal(published.label, "brown glasses");
  assert.deepEqual(published.evidence_ids, ["glasses-v6"]);
  assert.equal(published.object_local_colors[0].hex, "#4b2e20");
  assert.equal(published.validation_decision, "accepted");
  assert.equal(published.publication_decision, "publish");
  assert.equal(published.reconciliation_result, "highest_weighted_support");
  assert.equal(published.perception_source, "v6_reconciliation");
  assert.notDeepEqual(published, published.legacy_diagnostic);
});

test("authoritative mode honors the global publication gate even for pixel-accepted evidence", () => {
  const primary = { ...eyewear, source_type: "segmentation" };
  const rival = { ...eyewear, source_type: "segmentation", id: "hat-v6", label: "sunglasses", confidence: .94 };
  const decodedImage = rgbaImage(["#4b2e20", "#4b2e20", "#4b2e20", "#4b2e20"]);
  const result = buildOutfitAnalysis({ dominantHex: "#4b2e20", topColors: palette, segmentedRegions: [primary, rival], decodedImage, perception_v6_mode: "authoritative" });
  assert.equal(result.perception_v6.evidence_ledger[0].pixel_validation.accepted, true);
  assert.equal(result.perception_v6.publication_gating.allowed, false);
  assert.deepEqual(result.garment_zones.zones, {});
});

test("mixed eyewear crops retain dark object pixels without publishing skin pixels", () => {
  const skinHex = "#d99a73";
  const decodedImage = rgbaImage(["#4b2e20", "#4b2e20", "#4b2e20", skinHex, skinHex, skinHex]);
  const region = { ...eyewear, bbox: [0, 0, 1, 1] };
  const v5 = analyzePerceptionV5({ regions: [region] });
  const v6 = analyzePerceptionV6({ perceptionV5: v5, regions: [region], decodedImage });
  const evidence = v6.evidence_ledger[0];
  assert.equal(evidence.accepted, true);
  assert.ok(evidence.object_local_colors.some((color) => color.hex === "#4b2e20"));
  assert.ok(!evidence.object_local_colors.some((color) => color.hex === skinHex));
  assert.ok(evidence.pixel_validation.class_counts.skin > 0);
});
