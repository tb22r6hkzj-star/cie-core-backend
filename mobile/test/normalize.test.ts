import test from "node:test";
import assert from "node:assert/strict";
import { normalizeAnalysisResult, normalizeTransformResponse, normalizeZone } from "../src/api/normalize.ts";

test("Head-to-Toe prefers the authoritative primary identity over stale aliases", () => {
  const zone = normalizeZone("footwear", {
    name: "Luxury Tan",
    display_label: "Luxury Tan",
    hex: "#0F0E10",
    primary_color: { hex: "#0F0E10", name: "Graphite Black" },
    color_identity: { name: "Luxury Tan", translation: "Dark Earth" },
    confidence: 63
  });
  assert.equal(zone.pieceLabel, "Footwear");
  assert.equal(zone.colorName, "Graphite Black");
  assert.equal(zone.hex, "#0F0E10");
});

test("published accessory identity remains visible when color is withheld", () => {
  const [watch] = normalizeTransformResponse({ outfit_analysis: { garment_zones: { zones: {
    accessory_watch: {
      label: "watch",
      name: "Watch",
      confidence: 0.79,
      identity_publication_decision: "publish",
      color_publication_decision: "withhold_unvalidated_color"
    }
  } } } });
  assert.equal(watch?.pieceLabel, "Watch");
  assert.equal(watch?.colorName, null);
  assert.equal(watch?.colorWithheld, true);
  assert.equal(watch?.confidence, 79);
});

test("full result normalizes score, reasoning, modes, and palette for the native summary", () => {
  const result = normalizeAnalysisResult({
    dominantHex: "#415242",
    dominantName: "Muted Forest Green",
    palettes: { natural: { named_hexes: [{ hex: "#6E8958", name: "Muted Olive" }], reason: "Earth blend" } },
    outfit_analysis: {
      outfit_score: 85,
      best_mode: "Natural",
      best_mode_score: 94.75,
      mode_scores: [{ mode: "Natural", score: 94.75 }],
      score_breakdown: { harmony: 87, applicability: 100 },
      why_this_works: "The colors share a grounded relationship.",
      suggested_adjustment: "Deepen the brown slightly.",
      garment_zones: { zones: { lower_garment: { primary_color: { hex: "#415242", name: "Muted Forest Green" } } } }
    }
  });
  assert.equal(result.outfitScore, 85);
  assert.equal(result.modes[0]?.colors[0]?.name, "Muted Olive");
  assert.equal(result.scoreBreakdown[1]?.label, "Applicability");
  assert.equal(result.zones[0]?.colorName, "Muted Forest Green");
});
