import test from "node:test";
import assert from "node:assert/strict";
import { normalizeTransformResponse, normalizeZone } from "../src/api/normalize.ts";

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
