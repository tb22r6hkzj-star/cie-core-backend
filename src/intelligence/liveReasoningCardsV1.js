import { buildAppearanceMeasurementSynthesesV1 } from "./appearanceMeasurementSynthesisV1.js";

function compactCard(entry = {}) {
  return {
    piece: entry?.piece || null,
    reasoning_state: entry?.reasoning_state || "insufficient_context",
    measured_color: entry?.measurement_truth?.hex || null,
    measured_family: entry?.measurement_truth?.family || null,
    appearance_note: entry?.card?.appearance_note || null,
    reason: entry?.card?.reason || null,
    confidence: entry?.card?.confidence || null,
  };
}

/**
 * Builds live, consumer-safe reasoning cards from the already-bounded semantic
 * reconciliation payload. Numeric authority remains with VisionCore.
 */
export function buildLiveReasoningCardsV1(semanticReconciliation = {}) {
  const syntheses = buildAppearanceMeasurementSynthesesV1(semanticReconciliation);
  return {
    version: "live_reasoning_cards_v1",
    authority_owner: "visioncore",
    cards: syntheses.map(compactCard),
    detailed_synthesis: syntheses,
    publication_changed: false,
    measured_hex_changed: false,
  };
}
