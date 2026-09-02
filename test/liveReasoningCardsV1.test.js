import test from "node:test";
import assert from "node:assert/strict";
import { buildLiveReasoningCardsV1 } from "../src/intelligence/liveReasoningCardsV1.js";

test("builds compact consumer-safe card from semantic reconciliation", () => {
  const result = buildLiveReasoningCardsV1({
    candidates: [{
      piece: "upper_garment",
      color_crosscheck: {
        disposition: "visioncore_strong_measurement_preserved",
        openai_hypothesis: {
          family: "brown",
          appearance_cue: "brownish burgundy",
          lighting_cue: "warm indoor lighting",
          confidence: 0.91,
        },
        visioncore_measurement: {
          available: true,
          family: "red",
          hex: "#6F263D",
          confidence: 0.94,
          source: "visioncore_object_local_measurement",
        },
        bidirectional_challenge: {
          disagreement: true,
          nuance_synthesis_required: true,
        },
      },
    }],
  });

  assert.equal(result.cards.length, 1);
  assert.equal(result.cards[0].measured_color, "#6F263D");
  assert.equal(result.cards[0].appearance_note, "Appears brownish burgundy");
  assert.equal(result.cards[0].reason, "Warm lighting");
  assert.equal(result.measured_hex_changed, false);
  assert.equal(result.publication_changed, false);
});
