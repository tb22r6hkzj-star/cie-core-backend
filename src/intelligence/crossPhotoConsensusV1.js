import chroma from "chroma-js";

const VERSION = "cross_photo_consensus_v1";

function safeHex(value) {
  try {
    const raw = typeof value === "string" ? value : value?.hex || value?.base;
    return raw ? chroma(raw).hex().toUpperCase() : null;
  } catch {
    return null;
  }
}

function distance(left, right) {
  try {
    return chroma.distance(left, right, "lab");
  } catch {
    return Infinity;
  }
}

function normalizedConfidence(zone = {}) {
  const raw = Number(zone?.unified_confidence ?? zone?.calibrated_confidence ?? zone?.confidence ?? zone?.score ?? 0);
  return Math.max(0, Math.min(1, raw > 1 ? raw / 100 : raw));
}

function zoneHex(zone = {}) {
  return safeHex(zone?.primary_color?.hex || zone?.signature_color?.hex || zone?.hex || zone?.object_local_colors?.[0]?.hex);
}

function zoneLabel(zone = {}) {
  return String(zone?.garment_type || zone?.object_type || zone?.accessory_type || zone?.label || zone?.name || "unknown").trim().toLowerCase();
}

function medoid(rows) {
  return rows.map((candidate) => ({
    candidate,
    total: rows.reduce((sum, row) => sum + distance(candidate.hex, row.hex), 0),
  })).sort((a, b) => a.total - b.total)[0]?.candidate || null;
}

function analyzeZone(zone, rows, qualifiedPhotoCount, colorThreshold) {
  const presentRatio = qualifiedPhotoCount ? rows.length / qualifiedPhotoCount : 0;
  const labels = new Map();
  for (const row of rows) labels.set(row.label, (labels.get(row.label) || 0) + 1);
  const [selectedLabel, selectedLabelCount] = [...labels.entries()].sort((a, b) => b[1] - a[1])[0] || ["unknown", 0];
  const colorRows = rows.filter((row) => row.hex);
  const selected = medoid(colorRows);
  const distances = selected ? colorRows.map((row) => distance(selected.hex, row.hex)) : [];
  const maximumDistance = distances.length ? Math.max(...distances) : null;
  const meanDistance = distances.length ? distances.reduce((sum, value) => sum + value, 0) / distances.length : null;
  const identityAgreement = rows.length ? selectedLabelCount / rows.length : 0;
  const stable = rows.length >= 2 && colorRows.length >= 2 && presentRatio >= 0.67 && identityAgreement >= 0.67 && maximumDistance <= colorThreshold;
  return {
    zone,
    stable,
    publication_recommendation: stable ? "cross_photo_supported" : "withhold_or_request_reference",
    selected_label: selectedLabel,
    selected_hex: selected?.hex || null,
    supporting_photo_ids: rows.map((row) => row.image_id),
    photo_presence_ratio: Number(presentRatio.toFixed(3)),
    identity_agreement_ratio: Number(identityAgreement.toFixed(3)),
    maximum_lab_distance: maximumDistance === null ? null : Number(maximumDistance.toFixed(3)),
    mean_lab_distance: meanDistance === null ? null : Number(meanDistance.toFixed(3)),
    average_confidence: rows.length ? Number((rows.reduce((sum, row) => sum + row.confidence, 0) / rows.length).toFixed(3)) : 0,
    observations: rows,
  };
}
export function evaluateCrossPhotoConsensusV1({ analyses = [], colorThreshold = 12 } = {}) {
  const photos = (Array.isArray(analyses) ? analyses : []).map((analysis, index) => ({
    image_id: String(analysis?.image_id || analysis?.id || `photo_${index + 1}`),
    capture_disposition: analysis?.capture_quality?.disposition || analysis?.capture_quality_v1?.disposition || "unknown",
    zones: analysis?.garment_zones?.zones || analysis?.outfit_analysis?.garment_zones?.zones || {},
  }));
  const qualified = photos.filter((photo) => photo.capture_disposition !== "retake");
  if (qualified.length < 2) {
    return {
      version: VERSION,
      available: false,
      reason: "at_least_two_qualified_photos_required",
      input_photo_count: photos.length,
      qualified_photo_count: qualified.length,
      stable: false,
      zones: {},
    };
  }

  const rowsByZone = new Map();
  for (const photo of qualified) {
    for (const [zone, value] of Object.entries(photo.zones || {})) {
      const rows = rowsByZone.get(zone) || [];
      rows.push({
        image_id: photo.image_id,
        label: zoneLabel(value),
        hex: zoneHex(value),
        confidence: normalizedConfidence(value),
      });
      rowsByZone.set(zone, rows);
    }
  }
  const zones = Object.fromEntries([...rowsByZone.entries()].map(([zone, rows]) => [zone, analyzeZone(zone, rows, qualified.length, colorThreshold)]));
  const zoneValues = Object.values(zones);
  return {
    version: VERSION,
    available: true,
    input_photo_count: photos.length,
    qualified_photo_count: qualified.length,
    excluded_photo_ids: photos.filter((photo) => photo.capture_disposition === "retake").map((photo) => photo.image_id),
    stable: zoneValues.length > 0 && zoneValues.every((zone) => zone.stable),
    stable_zone_count: zoneValues.filter((zone) => zone.stable).length,
    unresolved_zone_count: zoneValues.filter((zone) => !zone.stable).length,
    zones,
    next_action: zoneValues.every((zone) => zone.stable) ? "publish_cross_photo_evidence" : "retake_or_measure_physical_reference",
  };
}
