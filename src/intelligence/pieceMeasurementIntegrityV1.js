import chroma from "chroma-js";

function clamp01(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.max(0, Math.min(1, numeric > 1 ? numeric / 100 : numeric));
}

function token(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");
}

function distance(a, b) {
  try { return chroma.distance(a, b, "lab"); } catch { return Number.POSITIVE_INFINITY; }
}

function palette(zone = {}) {
  const values = [
    zone?.primary_color,
    zone?.dominant_color,
    ...(Array.isArray(zone?.object_local_colors) ? zone.object_local_colors : []),
    ...(Array.isArray(zone?.region_colors) ? zone.region_colors : []),
    ...(Array.isArray(zone?.detected_colors) ? zone.detected_colors : []),
  ].filter((row) => row?.hex);
  return values.filter((row, index) => values.findIndex((other) =>
    String(other.hex).toUpperCase() === String(row.hex).toUpperCase()
  ) === index);
}

function confidence(zone = {}) {
  for (const value of [zone?.unified_confidence, zone?.calibrated_confidence, zone?.confidence, zone?.score]) {
    const normalized = clamp01(value);
    if (normalized !== null) return normalized;
  }
  return 0;
}

function share(row = {}) {
  return clamp01(row?.pct ?? row?.percentage ?? row?.share);
}

function integrityReasons(zone = {}) {
  const colors = palette(zone);
  const primary = colors[0] || null;
  const primaryShare = share(primary);
  const mode = token(zone?.color_mode || zone?.interpretation || zone?.mode);
  const measurementConfidence = confidence(zone);
  const reasons = [];

  if (colors.length && measurementConfidence > 0 && measurementConfidence < 0.35) {
    reasons.push("published_measurement_below_confidence_floor");
  }
  if (["single", "single_color", "solid"].includes(mode) && colors.length === 1
    && primaryShare !== null && primaryShare > 0 && primaryShare < 0.5) {
    reasons.push("single_color_share_is_not_object_local");
  }
  const meaningful = colors.filter((row) => (share(row) || 0) >= 0.03);
  if (meaningful.some((left, index) => meaningful.slice(index + 1)
    .some((right) => distance(left.hex, right.hex) < 8))) {
    reasons.push("perceptually_duplicate_palette_clusters");
  }
  return { reasons, measurementConfidence };
}

/**
 * Local measurement integrity is evaluated independently of the semantic
 * observer. These syntheses enter the same bounded correction lane, ensuring
 * a bad mask cannot publish merely because semantic reconciliation was quiet.
 */
export function buildLocalMeasurementIntegritySynthesesV1(outfitAnalysis = {}) {
  const zones = outfitAnalysis?.garment_zones?.zones || {};
  return Object.entries(zones).flatMap(([zoneKey, zone]) => {
    const { reasons, measurementConfidence } = integrityReasons(zone);
    if (!reasons.length) return [];
    return [{
      version: "appearance_measurement_synthesis_v1",
      piece: zoneKey,
      instance_key: zone?.semantic_instance_key || zone?.instance_key || null,
      reasoning_state: "appearance_alert",
      authority_owner: "visioncore",
      appearance_truth: { confidence: 1 },
      measurement_truth: { confidence: Math.min(measurementConfidence, 0.79) },
      relationship: { targeted_remeasurement_requested: true },
      integrity_v1: {
        required: true,
        reasons,
        force_fresh_segmentation: true,
      },
    }];
  });
}

export function mergeCorrectionSynthesesV1(...collections) {
  const byPiece = new Map();
  for (const synthesis of collections.flat().filter(Boolean)) {
    const key = `${token(synthesis?.piece)}:${token(synthesis?.instance_key)}`;
    const existing = byPiece.get(key);
    if (!existing || synthesis?.integrity_v1?.required === true) byPiece.set(key, synthesis);
  }
  return [...byPiece.values()];
}

export function inspectPieceMeasurementIntegrityV1(zone = {}) {
  return integrityReasons(zone);
}

/**
 * Accuracy is an abstention contract as well as a retry contract. If the
 * bounded fresh-mask pass still leaves a published piece below the numeric
 * confidence floor, remove color authority while preserving piece identity.
 */
export function applyUnresolvedMeasurementIntegrityGateV1(outfitAnalysis = {}) {
  const zones = outfitAnalysis?.garment_zones?.zones;
  if (!zones || typeof zones !== "object") return outfitAnalysis;
  const withheld = [];
  const nextZones = Object.fromEntries(Object.entries(zones).map(([zoneKey, zone]) => {
    const { reasons } = integrityReasons(zone);
    if (!reasons.includes("published_measurement_below_confidence_floor")) return [zoneKey, zone];
    withheld.push({ zone: zoneKey, reasons });
    return [zoneKey, {
      ...zone,
      interpretation: "unknown",
      color_mode: "unknown",
      publication_state: "unknown",
      publication_decision: "withhold_unresolved_measurement_integrity",
      color_publication_decision: "withhold_unresolved_measurement_integrity",
      validation_decision: "identity_only",
      validation_reason: "fresh_measurement_did_not_clear_integrity_floor",
      measurement_integrity_v1: { passed: false, reasons },
    }];
  }));
  return {
    ...outfitAnalysis,
    garment_zones: { ...outfitAnalysis.garment_zones, zones: nextZones },
    measurement_integrity_v1: {
      version: "piece_measurement_integrity_v1",
      passed: withheld.length === 0,
      withheld,
    },
  };
}
