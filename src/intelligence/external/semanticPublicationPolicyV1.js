import { normalizeSemanticPieceV1 } from "./semanticReconciliationV1.js";

const SUPPRESSION_THRESHOLD = 0.97;
const CONFIRMATION_THRESHOLD = 0.95;

function hasDirectDinoEvidence(piece, outfitAnalysis = {}) {
  return (outfitAnalysis?.segmented_regions || []).some((region) => {
    if (region?.source_type !== "grounding_dino" && region?.source_type !== "dino_detection") return false;
    return [region?.zone, region?.label, region?.segment_label, region?.object_type, region?.accessory_type]
      .map(normalizeSemanticPieceV1)
      .includes(piece);
  });
}

/**
 * Converts shadow reconciliation into bounded publication constraints.
 * External semantics may suppress an unsupported phantom identity or confirm
 * that strong VisionCore spatial evidence is correctly named. It never
 * supplies pixels, colors, masks, scores, or a replacement region.
 */
export function buildSemanticPublicationConstraintsV1({ reconciliation = {}, outfitAnalysis = {} } = {}) {
  const confirmedPieces = new Set();
  const suppressedPieces = new Set();

  for (const candidate of reconciliation?.candidates || []) {
    const piece = normalizeSemanticPieceV1(candidate?.piece);
    const confidence = Number(candidate?.semantic_confidence || 0);
    if (!piece) continue;

    if (
      candidate?.action === "support" &&
      candidate?.spatial_evidence?.supported === true &&
      confidence >= CONFIRMATION_THRESHOLD
    ) {
      confirmedPieces.add(piece);
    }

    if (
      candidate?.action === "contradict" &&
      confidence >= SUPPRESSION_THRESHOLD &&
      !hasDirectDinoEvidence(piece, outfitAnalysis)
    ) {
      suppressedPieces.add(piece);
    }

    if (
      candidate?.action === "inventory_omission" &&
      confidence >= CONFIRMATION_THRESHOLD &&
      !hasDirectDinoEvidence(piece, outfitAnalysis)
    ) {
      suppressedPieces.add(piece);
    }
  }

  return {
    version: "semantic_publication_policy_v1",
    confirmed_pieces: [...confirmedPieces],
    suppressed_pieces: [...suppressedPieces],
    authority_owner: "visioncore",
    external_color_authority: false,
  };
}
