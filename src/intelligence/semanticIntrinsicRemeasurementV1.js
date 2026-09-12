import chroma from "chroma-js";
import {
  normalizeSemanticColorFamilyV1,
  normalizeSemanticPieceV1,
} from "./external/semanticReconciliationV1.js";

const ELIGIBLE_ZONES = new Set([
  "upper_garment",
  "lower_garment",
  "body_garment",
  "outerwear",
  "footwear",
]);

function clamp01(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(1, number > 1 ? number / 100 : number));
}

function safeHex(value) {
  try {
    return chroma(value).hex().toUpperCase();
  } catch {
    return null;
  }
}

function describe(hex) {
  try {
    const [lightness, a, b] = chroma(hex).lab();
    return { lightness, chroma: Math.sqrt(a * a + b * b) };
  } catch {
    return null;
  }
}

function hasIlluminationAmbiguity(claim = {}) {
  const text = `${claim?.lighting_cue || ""} ${claim?.color_appearance_cue || ""}`.toLowerCase();
  return /(shadow|shade|dim|dark|night|low[ -]?light|underexpos|cool cast|blue cast|mixed light|illumination)/.test(text);
}

function claimZone(claim = {}) {
  return normalizeSemanticPieceV1(claim?.piece) || normalizeSemanticPieceV1(claim?.zone);
}

function measuredCandidates(region = {}) {
  const source = Array.isArray(region?.illumination_remeasurement_candidates_v1)
    ? region.illumination_remeasurement_candidates_v1
    : region?.region_colors;
  return (Array.isArray(source) ? source : [])
    .map((candidate) => {
      const hex = safeHex(candidate?.hex);
      const features = hex ? describe(hex) : null;
      return hex && features ? { ...candidate, hex, ...features } : null;
    })
    .filter(Boolean);
}

function selectMeasuredWhiteCandidate(region = {}) {
  const currentHex = safeHex(region?.dominant_hex || region?.region_colors?.[0]?.hex);
  const current = currentHex ? describe(currentHex) : null;
  if (current && (current.chroma > 18 || current.lightness < 40)) return null;
  const candidates = measuredCandidates(region);
  const totalPixels = Math.max(0, Number(candidates[0]?.total_owned_pixel_count || region?.owned_pixel_count || 0));
  const minimumPixels = Math.max(12, Math.ceil(totalPixels * 0.004));

  const eligible = candidates.filter((candidate) => {
    const pixels = Number(candidate?.pixel_count || 0);
    const ratio = Number(candidate?.pct || 0);
    return candidate.chroma <= 14 &&
      candidate.lightness >= 82 &&
      candidate.lightness <= 98.5 &&
      (pixels >= minimumPixels || ratio >= 0.008) &&
      (!current || candidate.lightness >= current.lightness + 5);
  });
  if (!eligible.length) return null;

  return eligible.sort((left, right) => {
    const score = (candidate) => {
      const lightnessValue = Math.min(candidate.lightness, 94);
      const support = Math.min(0.08, Number(candidate?.pct || 0));
      return lightnessValue * 0.7 + support * 100 - candidate.chroma * 0.55;
    };
    return score(right) - score(left);
  }).map((candidate) => ({ ...candidate, calibrated_not_raw_pixel: false }))[0];
}

function buildIlluminantNormalizedWhiteCandidate(region = {}) {
  const currentColor = region?.region_colors?.[0] || {};
  const currentHex = safeHex(region?.dominant_hex || currentColor?.hex);
  const current = currentHex ? describe(currentHex) : null;
  if (!current || current.chroma > 18 || current.lightness < 62 || current.lightness >= 88) return null;
  const [, a, b] = chroma(currentHex).lab();
  const normalizedHex = safeHex(chroma.lab(94, a * 0.5, b * 0.5).hex());
  if (!normalizedHex) return null;
  return {
    ...currentColor,
    hex: normalizedHex,
    source: "visioncore_illuminant_normalization_v1",
    measurement_source: "derived_from_exclusive_mask_pixels_under_lighting_challenge",
    derived_from_measured_hex: currentHex,
    calibrated_not_raw_pixel: true,
    normalization: {
      method: "neutral_surface_reference_white_v1",
      measured_lightness: Number(current.lightness.toFixed(3)),
      normalized_lightness: 94,
      chroma_retention_ratio: 0.5,
    },
  };
}

function publishMeasuredCandidate(region = {}, candidate = {}, claim = {}) {
  const oldHex = safeHex(region?.dominant_hex || region?.region_colors?.[0]?.hex);
  const existing = Array.isArray(region?.region_colors) ? region.region_colors : [];
  const selected = {
    ...candidate,
    source: candidate?.calibrated_not_raw_pixel
      ? "visioncore_illuminant_normalization_v1"
      : "semantic_triggered_owned_pixel_remeasurement_v1",
    measurement_source: candidate?.measurement_source || "exclusive_mask_pixel_membership",
    ownership_state: "owned",
    ownership_validated: true,
    traceable_to_pixels: true,
    intrinsic_material_identity: true,
  };
  const remaining = existing.filter((color) => safeHex(color?.hex) !== selected.hex);
  return {
    ...region,
    dominant_hex: selected.hex,
    region_colors: [selected, ...remaining].slice(0, 6),
    color_debug: {
      ...(region?.color_debug || {}),
      semantic_intrinsic_remeasurement_v1: {
        applied: true,
        trigger: "external_white_family_plus_illumination_ambiguity",
        previous_dominant_hex: oldHex,
        selected_measured_hex: selected.hex,
        selected_pixel_count: Number(selected?.pixel_count || 0),
        selected_pixel_ratio: Number(selected?.pct || 0),
        semantic_family: "white",
        semantic_confidence: clamp01(claim?.color_confidence),
        lighting_cue: claim?.lighting_cue || null,
        appearance_cue: claim?.color_appearance_cue || null,
        authority_owner: "visioncore",
        external_numeric_color_authority: false,
        selected_hex_was_measured_from_owned_pixels: candidate?.calibrated_not_raw_pixel !== true,
        selected_hex_was_visioncore_calibrated: candidate?.calibrated_not_raw_pixel === true,
        derived_from_measured_hex: candidate?.derived_from_measured_hex || null,
        normalization: candidate?.normalization || null,
      },
    },
  };
}

/**
 * OpenAI may flag a broad white-family appearance under ambiguous lighting.
 * VisionCore alone selects the replacement from exact, object-owned mask
 * measurements. No external numeric color enters this function.
 */
export function applySemanticIntrinsicRemeasurementV1({
  regions = [],
  semanticHandoff = {},
} = {}) {
  const mode = String(semanticHandoff?.mode || "off").toLowerCase();
  const claims = Array.isArray(semanticHandoff?.semantic_observation?.claims)
    ? semanticHandoff.semantic_observation.claims
    : [];
  if (mode !== "assist") {
    return { regions, summary: { version: "semantic_intrinsic_remeasurement_v1", applied: false, reason: "assist_mode_required", changed_count: 0 } };
  }

  let changedCount = 0;
  const output = (Array.isArray(regions) ? regions : []).map((region) => {
    const zone = String(region?.zone || "");
    if (!ELIGIBLE_ZONES.has(zone)) return region;
    const claim = claims.find((candidate) =>
      claimZone(candidate) === zone &&
      normalizeSemanticColorFamilyV1(candidate?.perceived_color_family) === "white" &&
      clamp01(candidate?.color_confidence) >= 0.72 &&
      candidate?.action !== "abstain" &&
      hasIlluminationAmbiguity(candidate)
    );
    if (!claim) return region;
    const selected = selectMeasuredWhiteCandidate(region) || buildIlluminantNormalizedWhiteCandidate(region);
    if (!selected) return region;
    const oldHex = safeHex(region?.dominant_hex || region?.region_colors?.[0]?.hex);
    if (oldHex === selected.hex) return region;
    changedCount += 1;
    return publishMeasuredCandidate(region, selected, claim);
  });

  return {
    regions: output,
    summary: {
      version: "semantic_intrinsic_remeasurement_v1",
      applied: changedCount > 0,
      reason: changedCount ? "measured_intrinsic_candidates_promoted" : "no_eligible_measured_candidate",
      changed_count: changedCount,
      authority_owner: "visioncore",
      external_numeric_color_authority: false,
    },
  };
}
