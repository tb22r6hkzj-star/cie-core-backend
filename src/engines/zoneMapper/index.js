// src/engines/zoneMapper/index.js
// Production zone mapper engine for converting detection and product labels into canonical zones.

import { ZONE_ALIASES, ZONE_IDS } from "../ontology/vocabulary.js";

const UNKNOWN_ZONE = "unknown";

const NORMALIZED_ALIAS_ENTRIES = Object.freeze(
  Object.entries(ZONE_ALIASES).flatMap(([zone, aliases]) =>
    aliases.map((alias) => Object.freeze({ zone, alias: normalizeLabel(alias) }))
  )
);

export const ZONE_MAPPER_ENGINE = Object.freeze({
  name: "zoneMapper",
  version: "1.0.0",
  zones: Object.freeze([...ZONE_IDS]),
});

export function normalizeLabel(label = "") {
  return String(label ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_-]+/g, " ")
    .replace(/[^a-zA-Z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function normalizeZoneKey(zone = "") {
  const normalized = normalizeLabel(zone).replace(/\s+/g, "_");
  return Object.hasOwn(ZONE_ALIASES, normalized) || normalized === UNKNOWN_ZONE ? normalized : UNKNOWN_ZONE;
}

export function getZoneAliases() {
  return Object.fromEntries(Object.entries(ZONE_ALIASES).map(([zone, aliases]) => [zone, [...aliases]]));
}

export function getZoneFromLabel(label = "") {
  const normalized = normalizeLabel(label);
  if (!normalized) return UNKNOWN_ZONE;

  const directZone = normalizeZoneKey(normalized);
  if (directZone !== UNKNOWN_ZONE) return directZone;

  const padded = ` ${normalized} `;
  const match = NORMALIZED_ALIAS_ENTRIES.find(({ alias }) => alias && padded.includes(` ${alias} `));
  return match?.zone || UNKNOWN_ZONE;
}

export function mapLabelToZone(label = "") {
  return getZoneFromLabel(label);
}

export function mapLabelsToZones(labels = []) {
  if (!Array.isArray(labels)) return [];
  return labels.map((label) => mapLabelToZone(label));
}

export function mapZones(input = []) {
  if (Array.isArray(input)) return mapLabelsToZones(input);
  if (input && typeof input === "object") {
    return Object.fromEntries(Object.entries(input).map(([key, label]) => [key, mapLabelToZone(label)]));
  }
  return mapLabelToZone(input);
}

const zoneMapper = Object.freeze({
  ZONE_MAPPER_ENGINE,
  getZoneFromLabel,
  mapLabelToZone,
  mapLabelsToZones,
  normalizeLabel,
  normalizeZoneKey,
  getZoneAliases,
  mapZones,
});

export default zoneMapper;
