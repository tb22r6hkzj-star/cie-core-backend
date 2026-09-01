function clamp01(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n > 1 ? n / 100 : n));
}

function titleCase(value) {
  return String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function shortText(value, max = 44) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return null;
  return text.length <= max ? text : `${text.slice(0, max - 1).trim()}…`;
}

function shortReason(lightingCue, appearanceCue) {
  const text = `${lightingCue || ""} ${appearanceCue || ""}`.toLowerCase();
  if (/warm|yellow|incandescent|tungsten/.test(text)) return "Warm lighting";
  if (/shadow|shade|dark/.test(text)) return "Shadow";
  if (/cool|blue light|bluish/.test(text)) return "Cool lighting";
  if (/glare|reflect|specular|shine/.test(text)) return "Reflection";
  if (/low light|dim|underexposed/.test(text)) return "Low light";
  if (/filter|edited|processing/.test(text)) return "Photo processing";
  return lightingCue || appearanceCue ? "Photo conditions" : null;
}

function confidenceLabel(value) {
  if (value >= 0.85) return "High";
  if (value >= 0.65) return "Moderate";
  return "Low";
}

function synthesisState(crosscheck = {}) {
  const disposition = crosscheck?.disposition;
  const challenge = crosscheck?.bidirectional_challenge || {};
  if (disposition === "independent_color_family_corroboration") return "convergent_truth";
  if (disposition === "targeted_visioncore_remeasurement_requested" || challenge?.targeted_remeasurement_requested) return "appearance_alert";
  if (disposition === "visioncore_strong_measurement_preserved") {
    return challenge?.nuance_synthesis_required ? "explainable_divergence" : "measurement_dominant";
  }
  if (challenge?.nuance_synthesis_required) return "explainable_divergence";
  if (challenge?.disagreement) return "unresolved_conflict";
  return "insufficient_context";
}

/**
 * Connects two different truth types without forcing false agreement:
 * - appearance truth from the semantic observer
 * - object-local measurement truth from VisionCore
 *
 * VisionCore remains authoritative for numeric color. The synthesis layer only
 * explains how the two observations relate and emits compact, card-safe copy.
 */
export function buildAppearanceMeasurementSynthesisV1(candidate = {}) {
  const crosscheck = candidate?.color_crosscheck || {};
  const semantic = crosscheck?.openai_hypothesis || {};
  const measurement = crosscheck?.visioncore_measurement || {};
  const state = synthesisState(crosscheck);
  const semanticConfidence = clamp01(semantic?.confidence);
  const measurementConfidence = clamp01(measurement?.confidence);
  const combinedConfidence = measurement?.available
    ? Math.max(0, Math.min(1, measurementConfidence * 0.7 + semanticConfidence * 0.3))
    : semanticConfidence;

  const measuredFamily = measurement?.family || null;
  const appearanceFamily = semantic?.family || null;
  const familyDiffers = Boolean(measuredFamily && appearanceFamily && measuredFamily !== appearanceFamily);
  const appearanceCue = shortText(semantic?.appearance_cue, 36);
  const appearanceNote = state === "convergent_truth"
    ? "Matches measured color"
    : appearanceCue
      ? `Appears ${appearanceCue.toLowerCase()}`
      : familyDiffers
        ? `Appears ${titleCase(appearanceFamily)}`
        : null;

  const reason = familyDiffers || state === "appearance_alert" || state === "explainable_divergence"
    ? shortReason(semantic?.lighting_cue, semantic?.appearance_cue)
    : null;

  return {
    version: "appearance_measurement_synthesis_v1",
    piece: candidate?.piece || null,
    reasoning_state: state,
    authority_owner: "visioncore",
    appearance_truth: {
      family: appearanceFamily,
      cue: semantic?.appearance_cue || null,
      lighting_cue: semantic?.lighting_cue || null,
      confidence: semanticConfidence,
    },
    measurement_truth: {
      family: measuredFamily,
      hex: measurement?.hex || null,
      confidence: measurementConfidence,
      source: measurement?.source || null,
    },
    relationship: {
      same_family: Boolean(measuredFamily && appearanceFamily && measuredFamily === appearanceFamily),
      explainable_divergence: state === "explainable_divergence",
      unresolved: state === "unresolved_conflict",
      targeted_remeasurement_requested: crosscheck?.remeasurement_requested === true,
      semantic_reassessment_requested: crosscheck?.semantic_reassessment_requested === true,
    },
    card: {
      appearance_note: shortText(appearanceNote, 46),
      reason: shortText(reason, 28),
      confidence: confidenceLabel(combinedConfidence),
    },
    publication_changed: false,
    measured_hex_changed: false,
  };
}

export function buildAppearanceMeasurementSynthesesV1(semanticReconciliation = {}) {
  const candidates = Array.isArray(semanticReconciliation?.candidates) ? semanticReconciliation.candidates : [];
  return candidates
    .filter((candidate) => candidate?.piece && candidate?.color_crosscheck)
    .map(buildAppearanceMeasurementSynthesisV1);
}
