const COLOR_FIELDS = [
  "hex", "dominant_hex", "dominant_color", "primary_color", "signature_color",
  "support_colors", "secondary_colors", "accent_colors", "detected_colors", "region_colors",
  "object_local_colors", "color_identity",
];

function isUncertain(zone = {}) {
  return String(zone?.interpretation || "").trim().toLowerCase() === "unknown"
    || (zone?.color_publication_decision && !String(zone.color_publication_decision).startsWith("publish"));
}

function neutralZoneLabel(zoneKey = "") {
  const labels = {
    footwear: "Footwear",
    accessory_jewelry: "Accessory",
    eyewear: "Eyewear",
    bag: "Bag",
    outerwear: "Outerwear",
    fur_trim: "Trim",
  };
  const token = zoneKey.startsWith("accessory_") && zoneKey !== "accessory_jewelry"
    ? zoneKey.replace(/^accessory_/, "").replace(/_\d+$/, "")
    : zoneKey;
  return labels[zoneKey] || String(token).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function sanitizeUncertainZone(zoneKey, zone) {
  if (!isUncertain(zone)) return zone;
  const label = neutralZoneLabel(zoneKey);
  const sanitized = { ...zone, name: label, label, display_label: label, display_zone_label: label };
  for (const field of COLOR_FIELDS) {
    sanitized[field] = field.endsWith("_colors") ? [] : null;
  }
  return sanitized;
}

function overlapsEvidence(a = {}, b = {}) {
  const left = new Set(Array.isArray(a?.evidence_ids) ? a.evidence_ids.filter(Boolean) : []);
  return (Array.isArray(b?.evidence_ids) ? b.evidence_ids : []).some((id) => left.has(id));
}

export function sanitizeCustomerFacingZonesV1(analysis = {}) {
  const originalZones = analysis?.garment_zones?.zones;
  if (!originalZones || typeof originalZones !== "object") return analysis;
  const zones = { ...originalZones };

  const logo = zones.logo_text_detail;
  if (logo && (isUncertain(logo) || logo?.publication_decision !== "publish")) {
    delete zones.logo_text_detail;
  }

  const canonicalAccessories = Object.entries(zones)
    .filter(([key, zone]) => key.startsWith("accessory_") && key !== "accessory_jewelry" && zone?.identity_publication_decision === "publish")
    .map(([, zone]) => zone);
  if (zones.accessory_jewelry && canonicalAccessories.some((zone) => overlapsEvidence(zones.accessory_jewelry, zone))) {
    delete zones.accessory_jewelry;
  }

  for (const [key, zone] of Object.entries(zones)) zones[key] = sanitizeUncertainZone(key, zone);

  return {
    ...analysis,
    garment_zones: {
      ...analysis.garment_zones,
      zones,
      customer_facing_zone_sanitization_v1: {
        applied: true,
        legacy_accessory_alias_removed: Boolean(originalZones.accessory_jewelry && !zones.accessory_jewelry),
        inconclusive_logo_removed: Boolean(originalZones.logo_text_detail && !zones.logo_text_detail),
      },
    },
  };
}
