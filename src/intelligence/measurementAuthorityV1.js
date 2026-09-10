import chroma from "chroma-js";

const SOURCE_PRIORITY = {
  accessory_positive_mask_pixels: 110,
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

function measurementRatio(candidate = {}) {
  const value = Number(candidate?.pct ?? candidate?.percentage ?? candidate?.display_pct ?? 0);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return clamp01(value > 1 ? value / 100 : value);
}

function measurementMass(candidate = {}) {
  const pixels = Math.max(0, Number(candidate?.pixel_count || 0));
  return pixels > 0 ? pixels : measurementRatio(candidate);
}

function mergeEquivalentMeasurements(candidates = [], maximumDeltaE = 8) {
  const groups = [];
  for (const candidate of candidates) {
    const match = groups.find((group) => (
      group.source === candidate.source &&
      group.ownership_validated === candidate.ownership_validated &&
      chroma.distance(group.hex, candidate.hex, "lab") <= maximumDeltaE
    ));
    if (!match) {
      groups.push({ ...candidate, merged_hexes: [candidate.hex], merged_measurement_count: 1 });
      continue;
    }

    const previousPixelCount = Math.max(0, Number(match.pixel_count || 0));
    const previousRatio = measurementRatio(match);
    const candidatePixelCount = Math.max(0, Number(candidate.pixel_count || 0));
    const candidateRatio = measurementRatio(candidate);
    if (measurementMass(candidate) > measurementMass(match)) {
      const aggregate = {
        pixel_count: previousPixelCount,
        pct: previousRatio,
        percentage: previousRatio,
        merged_hexes: match.merged_hexes,
        merged_measurement_count: match.merged_measurement_count,
      };
      Object.assign(match, candidate, aggregate);
    }
    match.pixel_count = previousPixelCount + candidatePixelCount;
    match.pct = clamp01(previousRatio + candidateRatio);
    match.percentage = match.pct;
    match.measured_ratio = match.pct;
    match.merged_hexes = [...new Set([...(match.merged_hexes || []), candidate.hex])];
    match.merged_measurement_count = Number(match.merged_measurement_count || 1) + 1;
    match.quality_score = Math.max(Number(match.quality_score || 0), Number(candidate.quality_score || 0));
  }
  return groups;
}

function explicitOwnershipValidation(candidate = {}) {
  if (candidate?.ownership_validated === true) return true;
  if (candidate?.ownership_validation?.validated === true) return true;
  if (candidate?.ownership_validation?.status === "validated") return true;
  if (candidate?.validation?.ownership_validated === true) return true;
  return false;
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
    ["accessory_positive_mask_pixels", "sam_mask_interior", "sam_mask", "owned_interior_pixels", "dino_bbox_interior", "dino_bbox"].includes(source)
  );

  const positivelyOwned = ["owned", "outfit", "positive", "confirmed"].includes(ownershipState);
  const ownershipValidated = explicitOwnershipValidation(candidate);
  const globalOnly = source === "global_palette";

  const qualityScore =
    sourcePriority(source) +
    Math.round(interiorRatio * 20) -
    Math.round(boundaryRatio * 20) +
    Math.round(confidence * 10) +
    (traceable ? 15 : -35) +
    (positivelyOwned ? 20 : -20) +
    (ownershipValidated ? 30 : -30) -
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
    ownership_validated: ownershipValidated,
    source_priority: sourcePriority(source),
    measured_ratio: measurementRatio(candidate),
    quality_score: qualityScore,
  };
}

/**
 * Measure Twice V1
 *
 * Measurement is allowed to become publishable garment truth only when:
 * 1) the color is traceable to measured pixels;
 * 2) those pixels are positively assigned to the target piece;
 * 3) that ownership assignment has been explicitly validated by a pixel-level
 *    ownership process rather than inferred from provenance/source alone;
 * 4) higher-purity spatial evidence outranks broader fallbacks.
 *
 * A detector box, source label, confidence score, or provenance trail can
 * propose evidence but cannot validate garment ownership by itself.
 * Unvalidated measurements remain diagnostic evidence and must abstain from
 * publication.
 */
export function selectMeasuredColorAuthorityV1(candidates = []) {
  const normalized = (Array.isArray(candidates) ? candidates : [])
    .map(normalizeMeasurement)
    .filter(Boolean);

  const eligible = normalized
    .filter((candidate) => candidate.traceable_to_pixels)
    .filter((candidate) => candidate.positively_owned)
    .filter((candidate) => candidate.ownership_validated)
    .filter((candidate) => candidate.source !== "global_palette");

  const publishable = mergeEquivalentMeasurements(eligible)
    .sort((a, b) => {
      if (b.source_priority !== a.source_priority) return b.source_priority - a.source_priority;
      if (b.pixel_count !== a.pixel_count) return b.pixel_count - a.pixel_count;
      if (b.measured_ratio !== a.measured_ratio) return b.measured_ratio - a.measured_ratio;
      if (b.quality_score !== a.quality_score) return b.quality_score - a.quality_score;
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
      pixel_ownership_validation_required: true,
      provenance_alone_cannot_validate_accuracy: true,
      detector_box_alone_cannot_validate_ownership: true,
      unvalidated_measurements_must_abstain: true,
      global_palette_can_publish_garment_truth: false,
      higher_purity_spatial_measurement_wins: true,
      equivalent_owned_clusters_are_merged_before_selection: true,
      largest_owned_pixel_mass_wins_within_authority_tier: true,
      reasoning_cannot_invent_replacement_hex: true,
    },
  };
}

export function measurementSourcePriorityV1(source) {
  return sourcePriority(source);
}
