import { buildAppearanceMeasurementSynthesesV1 } from "./appearanceMeasurementSynthesisV1.js";

function normalizeConfidence(zone = {}) {
  const value = Number(zone?.unified_confidence ?? zone?.calibrated_confidence ?? zone?.confidence ?? zone?.score ?? 0);
  return Math.max(0, Math.min(1, value > 1 ? value / 100 : value));
}

function primaryHex(zone = {}) {
  return zone?.primary_color?.hex || zone?.signature_color?.hex || zone?.hex || zone?.object_local_colors?.[0]?.hex || null;
}

function capturedHex(zone = {}) {
  return zone?.legacy_diagnostic?.hex || zone?.color_evidence_v1?.raw_primary?.hex || zone?.raw_primary_color?.hex || primaryHex(zone);
}

export function buildConsumerEvidenceV1({ outfitAnalysis = {}, captureQuality = null } = {}) {
  const zones = outfitAnalysis?.garment_zones?.zones || {};
  const captureDisposition = captureQuality?.disposition || "unknown";
  const semanticReconciliation = outfitAnalysis?.external_intelligence?.semantic_reconciliation || {};
  const syntheses = buildAppearanceMeasurementSynthesesV1(semanticReconciliation);
  const synthesisByPiece = new Map(syntheses.map((synthesis) => [synthesis?.piece, synthesis]));

  const pieces = Object.fromEntries(Object.entries(zones).map(([zone, value]) => {
    const captured = capturedHex(value);
    const estimated = primaryHex(value);
    const evidenceIds = value?.evidence_ids || value?.color_evidence_v1?.evidence_ids || [];
    const synthesis = synthesisByPiece.get(zone) || null;
    return [zone, {
      zone,
      identity: value?.garment_type || value?.object_type || value?.accessory_type || value?.label || value?.name || "unknown",
      captured_color: captured ? { hex: captured, meaning: "visible_in_uploaded_photo" } : null,
      estimated_garment_color: estimated ? { hex: estimated, meaning: "visioncore_best_supported_estimate" } : null,
      confidence: Number(normalizeConfidence(value).toFixed(3)),
      color_mode: value?.color_mode || value?.interpretation || "unknown",
      pattern: value?.pattern || null,
      evidence_count: Array.isArray(evidenceIds) ? evidenceIds.length : 0,
      publication_state: value?.publication_state || value?.publication_decision || "diagnostic",
      color_reasoning: synthesis ? {
        state: synthesis.reasoning_state,
        appearance_note: synthesis.card?.appearance_note || null,
        reason: synthesis.card?.reason || null,
        confidence: synthesis.card?.confidence || null,
      } : null,
      correction_fields: ["identity", "piece_ownership", "primary_color", "secondary_colors", "pattern"],
    }];
  }));

  return {
    version: "consumer_evidence_v1",
    authority_owner: "visioncore",
    capture_disposition: captureDisposition,
    intrinsic_color_claim_allowed: captureDisposition !== "retake",
    pieces,
    language_policy: {
      never_call_photo_pixels_physical_truth: true,
      captured_and_estimated_color_are_separate: true,
      color_reasoning_copy_stays_compact: true,
      appearance_and_measurement_can_both_be_true: true,
      low_evidence_requires_warning_or_abstention: true,
      user_correction_does_not_rewrite_original_result: true,
    },
  };
}
