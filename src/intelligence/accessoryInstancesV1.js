import { inferAccessoryDisplayMetadata } from "../ui/accessoryDisplay.js";
import { classifyMeasuredMetallicPaletteV1 } from "./metallicColorIdentityV1.js";

const JEWELRY_TYPES = new Set([
  "necklace",
  "chain",
  "pendant",
  "earrings",
  "ring",
  "bracelet",
  "watch",
  "brooch",
  "pin",
  "shoe_hardware",
]);

const CONFIDENCE_FLOORS = Object.freeze({
  earrings: 0.52,
  ring: 0.55,
  pin: 0.52,
  brooch: 0.48,
  bracelet: 0.46,
  watch: 0.46,
  pendant: 0.46,
  chain: 0.46,
  necklace: 0.44,
  shoe_hardware: 0.52,
});

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function normalizeType(value) {
  const token = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (/earring|ear_stud/.test(token)) return "earrings";
  if (/necklace/.test(token)) return "necklace";
  if (/chain/.test(token)) return "chain";
  if (/pendant/.test(token)) return "pendant";
  if (/bracelet/.test(token)) return "bracelet";
  if (/watch/.test(token)) return "watch";
  if (/(^|_)ring(s)?($|_)/.test(token)) return "ring";
  if (/brooch/.test(token)) return "brooch";
  if (/shoe_hardware|horsebit_shoe_hardware|metal_shoe_bit/.test(token)) return "shoe_hardware";
  if (/(^|_)pin($|_)/.test(token)) return "pin";
  return token;
}

function safeHex(value) {
  const match = String(value || "").trim().match(/^#?([0-9a-f]{6})$/i);
  return match ? `#${match[1].toUpperCase()}` : null;
}

function normalizedArea(geometry = {}) {
  const width = Number(geometry?.width ?? (Number(geometry?.x2) - Number(geometry?.x)));
  const height = Number(geometry?.height ?? (Number(geometry?.y2) - Number(geometry?.y)));
  return Number.isFinite(width) && Number.isFinite(height) ? Math.max(0, width) * Math.max(0, height) : 0;
}

function overlaps(a = {}, b = {}) {
  const left = Math.max(Number(a?.x || 0), Number(b?.x || 0));
  const top = Math.max(Number(a?.y || 0), Number(b?.y || 0));
  const right = Math.min(Number(a?.x2 ?? (Number(a?.x || 0) + Number(a?.width || 0))), Number(b?.x2 ?? (Number(b?.x || 0) + Number(b?.width || 0))));
  const bottom = Math.min(Number(a?.y2 ?? (Number(a?.y || 0) + Number(a?.height || 0))), Number(b?.y2 ?? (Number(b?.y || 0) + Number(b?.height || 0))));
  if (right <= left || bottom <= top) return 0;
  const intersection = (right - left) * (bottom - top);
  return intersection / Math.max(Math.min(normalizedArea(a), normalizedArea(b)), 1e-6);
}

function publishableColors(entry = {}) {
  const sampleCount = Number(entry?.pixel_evidence?.sample_count || 0);
  const minimumPixels = Math.max(2, Math.ceil(sampleCount * 0.012));
  return (entry?.object_local_colors || [])
    .map((color) => ({
      ...color,
      hex: safeHex(color?.hex),
      pct: clamp01(color?.pct),
      pixel_count: Number(color?.pixel_count || 0),
      surrounding_distance: Number(color?.surrounding_distance || 0),
    }))
    .filter((color) => color.hex)
    .filter((color) => !["skin", "highlight"].includes(String(color?.source_class || "")))
    .filter((color) => color.pixel_count >= minimumPixels || color.pct >= 0.025)
    .filter((color) => color.surrounding_distance >= 0.025 || color.pct >= 0.08)
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 4);
}

function evaluateEntry(entry = {}) {
  const type = normalizeType(entry?.label);
  if (entry?.zone !== "accessory_jewelry" || !JEWELRY_TYPES.has(type)) return null;
  const confidence = clamp01(entry?.confidence);
  const colors = publishableColors(entry);
  const pixels = entry?.pixel_evidence || {};
  const validation = entry?.validation || {};
  const directSpatialSource = ["grounding_dino", "dino_detection", "sam_segment"].includes(String(entry?.source || ""));
  const identityAccepted = entry?.accepted === true && directSpatialSource && confidence >= (CONFIDENCE_FLOORS[type] || 0.5);
  const pixelSupported = pixels?.available === true && validation?.supported === true && Number(pixels?.sample_count || 0) >= 6;
  const colorAccepted = identityAccepted && pixelSupported && colors.length > 0;
  return {
    type,
    confidence,
    colors,
    identityAccepted,
    colorAccepted,
    evidenceId: entry?.id || null,
    geometry: entry?.geometry || null,
    validationReason: validation?.reason || null,
    pixelSampleCount: Number(pixels?.sample_count || 0),
    highlightRatio: clamp01(pixels?.ratios?.highlight),
  };
}

function mergeSameType(entries = []) {
  const ordered = [...entries].sort((a, b) => b.confidence - a.confidence);
  const kept = [];
  for (const candidate of ordered) {
    const duplicate = kept.find((existing) => overlaps(existing.geometry, candidate.geometry) >= 0.72);
    if (!duplicate) kept.push(candidate);
  }
  return kept;
}

function buildInstance(entry, index) {
  const display = inferAccessoryDisplayMetadata([entry.type]);
  const primary = entry.colors[0] || null;
  const metallicIdentity = classifyMeasuredMetallicPaletteV1({
    colors: entry.colors,
    highlightRatio: entry.highlightRatio,
    validationSupported: entry.colorAccepted,
  });
  return {
    instance_id: `${entry.type}_${index + 1}`,
    zone_key: `accessory_${entry.type}${index ? `_${index + 1}` : ""}`,
    type: `accessory_${entry.type}`,
    display_zone_label: display.display_zone_label,
    accessory_type: entry.type,
    object_type: entry.type,
    label: entry.type,
    name: display.display_zone_label,
    confidence: entry.confidence,
    score: Math.round(entry.confidence * 100),
    geometry: entry.geometry,
    evidence_ids: [entry.evidenceId].filter(Boolean),
    identity_publication_decision: "publish",
    color_publication_decision: entry.colorAccepted ? "publish_object_local_color" : "withhold_unisolated_color",
    validation_decision: entry.colorAccepted ? "accepted" : "identity_only",
    validation_reason: entry.colorAccepted ? "validated_small_object_local_pixels" : entry.validationReason || "insufficient_object_local_color_evidence",
    object_local_colors: entry.colorAccepted ? entry.colors : [],
    hex: entry.colorAccepted ? primary?.hex || null : null,
    dominant_color: entry.colorAccepted ? primary : null,
    support_colors: entry.colorAccepted ? entry.colors.slice(1) : [],
    material_family: metallicIdentity.publishable ? metallicIdentity.family : null,
    material_display_name: metallicIdentity.publishable ? metallicIdentity.display_name : null,
    metallic_color_evidence_v1: metallicIdentity,
    source_type: "visioncore_accessory_instances_v1",
    external_color_authority: false,
    pixel_sample_count: entry.pixelSampleCount,
  };
}

/**
 * Preserves every independently validated jewelry identity. The legacy
 * accessory_jewelry slot remains untouched for older clients; new clients can
 * consume instances or the UI-ready per-instance zones.
 */
export function buildAccessoryInstancesV1({ perceptionV6 = {} } = {}) {
  const evaluated = (perceptionV6?.evidence_ledger || []).map(evaluateEntry).filter(Boolean);
  const byType = new Map();
  for (const entry of evaluated.filter((candidate) => candidate.identityAccepted)) {
    const rows = byType.get(entry.type) || [];
    rows.push(entry);
    byType.set(entry.type, rows);
  }
  const instances = [];
  for (const type of [...byType.keys()].sort()) {
    mergeSameType(byType.get(type)).forEach((entry, index) => instances.push(buildInstance(entry, index)));
  }
  return {
    version: "accessory_instances_v1",
    authority_owner: "visioncore",
    external_color_authority: false,
    instances,
    zones: Object.fromEntries(instances.map((instance) => [instance.zone_key, instance])),
    detected_count: instances.length,
    color_published_count: instances.filter((instance) => instance.color_publication_decision === "publish_object_local_color").length,
    color_withheld_count: instances.filter((instance) => instance.color_publication_decision !== "publish_object_local_color").length,
  };
}
