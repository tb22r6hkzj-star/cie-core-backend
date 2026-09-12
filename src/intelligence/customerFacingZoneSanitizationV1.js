import { getColorName } from "../engines/labelMapper/index.js";
import chroma from "chroma-js";

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

function strongestOwnedColor(analysis = {}, zoneKey = "") {
  return (analysis?.piece_color_ownership_v1?.accessory_color_authorities || [])
    .filter((entry) => entry?.zone === zoneKey && entry?.applied === true && entry?.dominant_hex)
    .sort((a, b) => Number(b?.confidence || 0) - Number(a?.confidence || 0))[0] || null;
}

function restoreOwnedZoneColor(analysis, zoneKey, zone) {
  const authority = strongestOwnedColor(analysis, zoneKey);
  if (!authority) return zone;
  const colors = Array.isArray(authority.region_colors) ? authority.region_colors : [];
  const authoritativeName = getColorName(authority.dominant_hex);
  const primary = {
    ...(colors[0] || { hex: authority.dominant_hex, pct: 1 }),
    hex: authority.dominant_hex,
    name: authoritativeName,
  };
  const namedColors = [primary, ...colors.slice(1).map((color) => ({
    ...color,
    name: color?.hex ? getColorName(color.hex) : color?.name,
  }))];
  return {
    ...zone,
    name: authoritativeName,
    hex: authority.dominant_hex,
    dominant_hex: authority.dominant_hex,
    dominant_color: primary,
    primary_color: primary,
    object_local_colors: namedColors,
    region_colors: namedColors,
    detected_colors: namedColors,
    support_colors: namedColors.slice(1),
    secondary_colors: namedColors.slice(1),
    interpretation: namedColors.length > 1 ? "multi_color" : "single_color",
    confidence: Math.max(Number(zone?.confidence || 0), Number(authority?.confidence || 0)),
    publication_state: "confirmed",
    publication_decision: "publish",
    validation_decision: "accepted",
    color_authority_source: authority.color_authority_source || "piece_color_ownership_v1",
  };
}

function normalizedPct(color = {}) {
  const value = Number(color?.pct ?? color?.percentage ?? 0);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return value > 1 ? value / 100 : value;
}

function colorDistance(a, b) {
  try { return chroma.distance(a, b, "lab"); } catch { return Number.POSITIVE_INFINITY; }
}

function confidence100(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.max(0, Math.min(100, numeric > 0 && numeric <= 1 ? numeric * 100 : numeric));
}

function synchronizePublishedConfidence(zone = {}) {
  if (isUncertain(zone)) return zone;
  const calibrated = [zone?.unified_confidence, zone?.calibrated_confidence, zone?.raw_confidence]
    .map(confidence100)
    .find((value) => value !== null && value > 0);
  if (calibrated === undefined) return zone;
  return {
    ...zone,
    // Customer-facing cards historically read `confidence`, while the current
    // pipeline publishes its decision confidence under the calibrated fields.
    confidence: calibrated,
  };
}

function publishedPalette(zone = {}) {
  const values = [
    zone?.primary_color,
    zone?.dominant_color,
    ...(Array.isArray(zone?.region_colors) ? zone.region_colors : []),
    ...(Array.isArray(zone?.detected_colors) ? zone.detected_colors : []),
  ];
  return values.filter((color, index) => color?.hex && values.findIndex((other) => other?.hex === color.hex) === index);
}

function enforceLayeredGarmentOwnership(zones = {}) {
  const upper = zones?.upper_garment;
  const outerwear = zones?.outerwear;
  if (!upper || !outerwear || isUncertain(upper) || isUncertain(outerwear)) return zones;

  const upperHex = upper?.primary_color?.hex || upper?.dominant_color?.hex || upper?.hex;
  const outerHex = outerwear?.primary_color?.hex || outerwear?.dominant_color?.hex || outerwear?.hex;
  if (!upperHex || !outerHex || colorDistance(upperHex, outerHex) < 18) return zones;

  const siblingColors = Object.entries(zones)
    .filter(([key, zone]) => key !== "upper_garment" && !isUncertain(zone))
    .flatMap(([, zone]) => publishedPalette(zone));
  const belongsToSibling = (color = {}) => {
    if (!color?.hex || colorDistance(color.hex, upperHex) < 8) return false;
    return siblingColors.some((sibling) =>
      colorDistance(color.hex, sibling.hex) <= 20
      && colorDistance(color.hex, sibling.hex) < colorDistance(color.hex, upperHex)
    );
  };
  const ownedSupporting = (colors) => (Array.isArray(colors) ? colors : [])
    .filter((color) => normalizedPct(color) >= 0.06)
    .filter((color) => !belongsToSibling(color));
  const supporting = ownedSupporting([
    ...(Array.isArray(upper?.support_colors) ? upper.support_colors : []),
    ...(Array.isArray(upper?.secondary_colors) ? upper.secondary_colors : []),
    ...(Array.isArray(upper?.accent_colors) ? upper.accent_colors : []),
  ]).filter((color, index, values) => values.findIndex((other) => other?.hex === color.hex) === index);
  const primary = synchronizeColorObject(upper?.primary_color || upper?.dominant_color || { hex: upperHex });
  const palette = [primary, ...supporting];

  return {
    ...zones,
    upper_garment: {
      ...upper,
      signature_color: supporting[0] || null,
      support_colors: supporting,
      secondary_colors: supporting,
      accent_colors: supporting.slice(1),
      detected_colors: palette,
      region_colors: palette,
      object_local_colors: palette,
      interpretation: supporting.length ? "multi_color" : "single_color",
      color_mode: supporting.length ? "multicolor" : "single_color",
      layered_ownership_reconciliation_v1: {
        applied: true,
        sibling_zone_count: Object.keys(zones).length - 1,
      },
    },
  };
}

function restoreCanonicalGarmentColor(zone = {}) {
  const authority = zone?.canonical_color_authority_v1;
  if (authority?.applied !== true || !authority?.dominant_hex) return zone;
  const primaryHex = authority.dominant_hex;
  const rows = (Array.isArray(authority?.region_colors) ? authority.region_colors : [])
    .filter((color) => color?.hex)
    .sort((a, b) => normalizedPct(b) - normalizedPct(a));
  const primarySource = rows.find((color) => color.hex === primaryHex) || rows[0] || { hex: primaryHex, pct: 1 };
  const primary = synchronizeColorObject({ ...primarySource, hex: primaryHex });
  const supporting = rows
    .filter((color) => color.hex !== primaryHex)
    .filter((color) => normalizedPct(color) >= 0.06)
    .filter((color) => colorDistance(primaryHex, color.hex) >= 18)
    .slice(0, 3)
    .map(synchronizeColorObject);
  const palette = [primary, ...supporting];
  return {
    ...zone,
    name: primary.name,
    display_label: primary.name,
    hex: primaryHex,
    dominant_hex: primaryHex,
    dominant_color: primary,
    primary_color: primary,
    signature_color: supporting[0] || null,
    support_colors: supporting,
    secondary_colors: supporting,
    accent_colors: supporting,
    detected_colors: palette,
    region_colors: palette,
    object_local_colors: palette,
    interpretation: supporting.length ? "multi_color" : "single_color",
    color_mode: supporting.length ? "multicolor" : "single_color",
    publication_state: "confirmed",
    publication_decision: "publish",
    validation_decision: "accepted",
    color_authority_source: authority.source || "canonical_color_authority_v1",
  };
}

function synchronizeColorObject(color) {
  if (!color?.hex) return color;
  const name = getColorName(color.hex);
  return {
    ...color,
    name,
    color_identity: {
      ...(color?.color_identity || {}),
      name,
    },
  };
}

function synchronizeColorList(colors) {
  return Array.isArray(colors) ? colors.map(synchronizeColorObject) : colors;
}

function synchronizeCustomerFacingColorAliases(zone = {}) {
  const primaryHex = zone?.primary_color?.hex || zone?.dominant_color?.hex || zone?.hex || zone?.dominant_hex;
  if (!primaryHex || isUncertain(zone)) return zone;
  const name = getColorName(primaryHex);
  const sourceIdentity = zone?.primary_color?.color_identity || zone?.dominant_color?.color_identity || zone?.color_identity || {};
  const colorIdentity = { ...sourceIdentity, name };
  const primaryIdentity = {
    ...(zone?.garment_identity?.primary_identity || {}),
    name,
    ...(colorIdentity?.translation ? { translation: colorIdentity.translation } : {}),
  };
  return {
    ...zone,
    name,
    display_label: name,
    color_identity: colorIdentity,
    dominant_color: synchronizeColorObject(zone?.dominant_color),
    primary_color: synchronizeColorObject(zone?.primary_color),
    signature_color: synchronizeColorObject(zone?.signature_color),
    support_colors: synchronizeColorList(zone?.support_colors),
    secondary_colors: synchronizeColorList(zone?.secondary_colors),
    accent_colors: synchronizeColorList(zone?.accent_colors),
    detected_colors: synchronizeColorList(zone?.detected_colors),
    region_colors: synchronizeColorList(zone?.region_colors),
    object_local_colors: synchronizeColorList(zone?.object_local_colors),
    garment_identity: {
      ...(zone?.garment_identity || {}),
      primary_identity: primaryIdentity,
    },
  };
}

function synchronizeDerivedItemWithPublishedZone(item = {}, zones = {}) {
  const zone = zones?.[item?.type];
  if (!zone || isUncertain(zone)) return item;

  const authoritativeHex = zone?.primary_color?.hex
    || zone?.dominant_color?.hex
    || zone?.hex
    || zone?.dominant_hex;
  if (!authoritativeHex) return item;

  const authoritativeName = getColorName(authoritativeHex);
  const sourcePrimary = synchronizeColorObject({
    ...(item?.primary_color || {}),
    ...(zone?.primary_color || zone?.dominant_color || {}),
    hex: authoritativeHex,
  });
  const sourceDominant = synchronizeColorObject({
    ...(item?.dominant_color || {}),
    ...(zone?.dominant_color || zone?.primary_color || {}),
    hex: authoritativeHex,
  });
  const sourceIdentity = sourcePrimary?.color_identity || sourceDominant?.color_identity || {};

  const sourceList = (field) => Array.isArray(zone?.[field])
    ? synchronizeColorList(zone[field])
    : synchronizeColorList(item?.[field]);

  return {
    ...item,
    confidence: zone?.confidence ?? item?.confidence,
    name: authoritativeName,
    ...(new Set(["upper_garment", "lower_garment", "body_garment", "outerwear"]).has(item?.type)
      ? { display_label: authoritativeName }
      : {}),
    dominant_color: sourceDominant,
    primary_color: sourcePrimary,
    signature_color: zone?.signature_color
      ? synchronizeColorObject(zone.signature_color)
      : synchronizeColorObject(item?.signature_color),
    support_colors: sourceList("support_colors"),
    secondary_colors: sourceList("secondary_colors"),
    accent_colors: sourceList("accent_colors"),
    detected_colors: sourceList("detected_colors"),
    region_colors: sourceList("region_colors"),
    object_local_colors: sourceList("object_local_colors"),
    color_identity: {
      ...(item?.color_identity || {}),
      ...sourceIdentity,
      name: authoritativeName,
    },
    garment_identity: {
      ...(item?.garment_identity || {}),
      primary_identity: {
        ...(item?.garment_identity?.primary_identity || {}),
        ...sourceIdentity,
        name: authoritativeName,
      },
    },
  };
}

function synchronizeDerivedCollection(collection, zones) {
  return Array.isArray(collection)
    ? collection.map((item) => synchronizeDerivedItemWithPublishedZone(item, zones))
    : collection;
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

  for (const [key, zone] of Object.entries(zones)) {
    const withCanonicalColor = restoreCanonicalGarmentColor(zone);
    const withOwnedColor = ["footwear", "bag"].includes(key)
      ? restoreOwnedZoneColor(analysis, key, withCanonicalColor)
      : withCanonicalColor;
    zones[key] = sanitizeUncertainZone(
      key,
      synchronizePublishedConfidence(synchronizeCustomerFacingColorAliases(withOwnedColor))
    );
  }

  const ownershipReconciledZones = enforceLayeredGarmentOwnership(zones);

  const garmentAnalysis = analysis?.garment_analysis
    ? {
        ...analysis.garment_analysis,
        detected_items: synchronizeDerivedCollection(analysis.garment_analysis.detected_items, ownershipReconciledZones),
      }
    : analysis?.garment_analysis;
  const materialAnalysis = analysis?.material_analysis
    ? {
        ...analysis.material_analysis,
        detected_items: synchronizeDerivedCollection(analysis.material_analysis.detected_items, ownershipReconciledZones),
      }
    : analysis?.material_analysis;

  return {
    ...analysis,
    garment_analysis: garmentAnalysis,
    material_analysis: materialAnalysis,
    accessory_analysis: synchronizeDerivedCollection(analysis?.accessory_analysis, ownershipReconciledZones),
    garment_zones: {
      ...analysis.garment_zones,
      zones: ownershipReconciledZones,
      customer_facing_zone_sanitization_v1: {
        applied: true,
        legacy_accessory_alias_removed: Boolean(originalZones.accessory_jewelry && !zones.accessory_jewelry),
        inconclusive_logo_removed: Boolean(originalZones.logo_text_detail && !zones.logo_text_detail),
      },
    },
  };
}
