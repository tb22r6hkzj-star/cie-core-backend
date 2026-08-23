import chroma from "chroma-js";

const SOURCE_PRIORITY = {
  sam_mask_interior: 100,
  sam_mask: 95,
  owned_interior_pixels: 90,
  dino_bbox_interior: 75,
  dino_bbox: 50,
  global_palette: 10,
  unknown: 0,
};

function safeHex(value) {
  try {
    const raw = typeof value === "string" ? value : value?.hex || value?.base || value?.color;
    return raw ? chroma(raw).hex().toUpperCase() : null;
  } catch {
    return null;
  }
}

function clamp01(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function sourcePriority(source) {
  return SOURCE_PRIORITY[String(source || "unknown")] ?? SOURCE_PRIORITY.unknown;
}

function normalizeMeasurement(candidate = {}) {
  const hex = safeHex(candidate);
  if (!hex) return null;

  const source = String(candidate?.source || candidate?.measurement_source || "unknown");
  const ownershipState = String(candidate?.ownership_state || candidate?.ownership || "unknown");
  const pixelCount = Math.max(0, Number(candidate?.pixel_count || candidate?.sample_count || 0));
  const interiorRatio = clamp01(candidate?.interior_ratio ?? candidate?.interior_weight ?? 0);
  const boundaryRatio = clamp01(candidate?.boundary_ratio ?? candidate?.boundary_weight ?? 0);
  const confidence = clamp01(
    Number(candidate?.confidence) > 1 ? Number(candidate?.confidence) / 100 : candidate?.confidence
  );

  const traceable = Boolean(
    candidate?.traceable_to_pixels === true ||
    pixelCount > 0 ||
    ["sam_mask_interior", "sam_mask", "owned_interior_pixels", "dino_bbox_interior", "dino_bbox"].includes(source)
  );

  const positivelyOwned = ["owned", "outfit", "positive", "confirmed"].includes(ownershipState);
  const globalOnly = source === "global_palette";

  const qualityScore =
    sourcePriority(source) +
    Math.round(interiorRatio * 20) -
    Math.round(boundaryRatio * 20) +
    Math.round(confidence * 10) +
    (traceable ? 15 : -35) +
    (positivelyOwned ? 20 : -20) -
    (globalOnly ? 50 : 0);

  return {
    ...candidate,
    hex,
    source,
    ownership_state: ownershipState,
    pixel_count: pixelCount,
    interior_ratio: interiorRatio,
    boundary_ratio: boundaryRatio,
    confidence,
    traceable_to_pixels: traceable,
    positively_owned: positivelyOwned,
    quality_score: qualityScore,
  };
}

/**
 * Measure Twice V1
 *
 * Measurement is allowed to become publishable garment truth only when:
 * 1) the color is traceable to measured pixels;
 * 2) those pixels are positively owned by the target piece;
 * 3) higher-purity spatial evidence outranks broader fallbacks.
 *
 * Global palette colors remain diagnostic/context evidence and can never win
 * garment measurement authority by themselves.
 */
export function selectMeasuredColorAuthorityV1(candidates = []) {
  const normalized = (Array.isArray(candidates) ? candidates : [])
    .map(normalizeMeasurement)
    .filter(Boolean);

  const publishable = normalized
    .filter((candidate) => candidate.traceable_to_pixels)
    .filter((candidate) => candidate.positively_owned)
    .filter((candidate) => candidate.source !== "global_palette")
    .sort((a, b) => {
      if (b.quality_score !== a.quality_score) return b.quality_score - a.quality_score;
      if (b.pixel_count !== a.pixel_count) return b.pixel_count - a.pixel_count;
      return b.confidence - a.confidence;
    });

  const selected = publishable[0] || null;

  return {
    version: "measurement_authority_v1",
    doctrine: "measure_twice_publish_once",
    selected,
    publishable,
    diagnostics: normalized,
    policy: {
      published_color_must_trace_to_measured_pixels: true,
      positive_piece_ownership_required: true,
      global_palette_can_publish_garment_truth: false,
      higher_purity_spatial_measurement_wins: true,
      reasoning_cannot_invent_replacement_hex: true,
    },
  };
}

export function measurementSourcePriorityV1(source) {
  return sourcePriority(source);
}
