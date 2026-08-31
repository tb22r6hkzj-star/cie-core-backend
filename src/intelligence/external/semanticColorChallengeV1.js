const FAMILY_ALIASES = Object.freeze({
  charcoal: "gray",
  grey: "gray",
  silver: "metallic_silver",
  gold: "metallic_gold",
  navy: "blue",
  olive: "green",
  cream: "beige",
  ivory: "white",
  tan: "beige",
  burgundy: "red",
  maroon: "red",
  teal: "blue",
  violet: "purple",
});

const VALID_FAMILIES = new Set([
  "black", "white", "gray", "brown", "beige", "red", "orange", "yellow",
  "green", "blue", "purple", "pink", "metallic_gold", "metallic_silver", "multicolor", "unclear",
]);

function cleanToken(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function clamp01(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n > 1 ? n / 100 : n));
}

export function normalizeColorFamilyForChallengeV1(value) {
  const token = cleanToken(value);
  if (!token) return null;
  if (FAMILY_ALIASES[token]) return FAMILY_ALIASES[token];
  for (const [alias, family] of Object.entries(FAMILY_ALIASES)) {
    if (token.includes(alias)) return family;
  }
  for (const family of VALID_FAMILIES) {
    if (token === family || token.includes(family)) return family;
  }
  return token;
}

/**
 * VisionCore Color Challenge V1
 *
 * This is the deterministic referee between external visual perception and
 * VisionCore's object-local measurement. OpenAI may challenge the categorical
 * interpretation. VisionCore may challenge OpenAI with measured evidence.
 * Neither lane silently overwrites the other.
 */
export function evaluateSemanticColorChallengeV1({
  mode = "shadow",
  semantic = {},
  measurement = {},
} = {}) {
  const semanticFamily = normalizeColorFamilyForChallengeV1(semantic?.family);
  const measuredFamily = normalizeColorFamilyForChallengeV1(measurement?.family);
  const semanticConfidence = clamp01(semantic?.confidence);
  const measurementConfidence = clamp01(measurement?.confidence);
  const measuredHex = measurement?.hex || null;
  const resolvedMode = ["off", "shadow", "assist"].includes(String(mode || "").toLowerCase())
    ? String(mode).toLowerCase()
    : "shadow";

  const base = {
    version: "semantic_color_challenge_v1",
    mode: resolvedMode,
    authority_owner: "visioncore",
    semantic_lane: {
      family: semanticFamily,
      confidence: semanticConfidence,
      appearance_cue: semantic?.appearance_cue || null,
      lighting_cue: semantic?.lighting_cue || null,
      numeric_color_supplied: false,
    },
    measurement_lane: {
      family: measuredFamily,
      hex: measuredHex,
      confidence: measurementConfidence,
      source: measurement?.source || null,
    },
    publication_changed: false,
    measured_hex_changed: false,
    semantic_override_allowed: false,
    targeted_remeasurement_requested: false,
    semantic_reassessment_requested: false,
    consensus: false,
    disagreement: false,
  };

  if (resolvedMode === "off") {
    return { ...base, disposition: "challenge_disabled" };
  }

  if (!semanticFamily || semanticFamily === "unclear") {
    return { ...base, disposition: "semantic_abstained" };
  }

  if (!measuredFamily && !measuredHex) {
    return {
      ...base,
      disposition: "measurement_missing",
      targeted_remeasurement_requested: resolvedMode === "assist" && semanticConfidence >= 0.9,
    };
  }

  if (!measuredFamily) {
    return {
      ...base,
      disposition: "measurement_family_unresolved",
      semantic_reassessment_requested: false,
      targeted_remeasurement_requested: resolvedMode === "assist" && semanticConfidence >= 0.9,
    };
  }

  if (semanticFamily === measuredFamily) {
    return {
      ...base,
      disposition: "independent_family_consensus",
      consensus: true,
    };
  }

  const strongMeasurement = measurementConfidence >= 0.8;
  const strongSemantic = semanticConfidence >= 0.9;

  if (strongMeasurement && strongSemantic) {
    return {
      ...base,
      disposition: resolvedMode === "assist"
        ? "two_way_challenge_remeasure_and_reassess"
        : "two_way_disagreement_recorded",
      disagreement: true,
      targeted_remeasurement_requested: resolvedMode === "assist",
      semantic_reassessment_requested: true,
    };
  }

  if (strongMeasurement) {
    return {
      ...base,
      disposition: "visioncore_measurement_challenges_semantic",
      disagreement: true,
      semantic_reassessment_requested: true,
    };
  }

  if (strongSemantic && resolvedMode === "assist") {
    return {
      ...base,
      disposition: "semantic_challenges_visioncore_measurement",
      disagreement: true,
      targeted_remeasurement_requested: true,
    };
  }

  return {
    ...base,
    disposition: "low_confidence_disagreement_recorded",
    disagreement: true,
  };
}
