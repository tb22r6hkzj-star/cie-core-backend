import { getColorName } from "../engines/labelMapper/index.js";
import chroma from "chroma-js";
import { canonicalizeColorObjectV1 } from "./colorIdentityContractV1.js";

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
    confidence: Math.max(
      confidence100(zone?.confidence) || 0,
      confidence100(authority?.confidence) || 0,
    ),
    publication_state: publicationStateForConfidence(zone, authority?.confidence),
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

function publicationStateForConfidence(zone = {}, fallbackConfidence = 0) {
  const values = [zone?.unified_confidence, zone?.calibrated_confidence, zone?.confidence, fallbackConfidence]
    .map(confidence100)
    .filter((value) => value !== null);
  const confidence = values.length ? Math.max(...values) : 0;
  if (confidence >= 80) return "confirmed";
  if (confidence >= 65) return "probable";
  if (confidence >= 45) return "possible";
  return "unknown";
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

function canonicalPublishedPalette(zone = {}) {
  const primaryHex = zone?.primary_color?.hex || zone?.dominant_color?.hex || zone?.hex || zone?.dominant_hex;
  const values = [
    zone?.primary_color,
    zone?.dominant_color,
    ...(Array.isArray(zone?.object_local_colors) ? zone.object_local_colors : []),
    ...(Array.isArray(zone?.region_colors) ? zone.region_colors : []),
    ...(Array.isArray(zone?.detected_colors) ? zone.detected_colors : []),
    ...(Array.isArray(zone?.support_colors) ? zone.support_colors : []),
    ...(Array.isArray(zone?.secondary_colors) ? zone.secondary_colors : []),
    ...(Array.isArray(zone?.accent_colors) ? zone.accent_colors : []),
  ].filter((color) => color?.hex);
  const unique = values.filter((color, index) =>
    values.findIndex((other) => String(other.hex).toUpperCase() === String(color.hex).toUpperCase()) === index
  );
  const primary = unique.find((color) => String(color.hex).toUpperCase() === String(primaryHex).toUpperCase())
    || (primaryHex ? { hex: primaryHex, pct: 1 } : unique[0]);
  if (!primary?.hex) return [];
  const supporting = unique
    .filter((color) => String(color.hex).toUpperCase() !== String(primary.hex).toUpperCase())
    .filter((color) => normalizedPct(color) >= 0.03 || color?.ownership_validated === true)
    .filter((color) => colorDistance(primary.hex, color.hex) >= 10)
    .sort((a, b) => normalizedPct(b) - normalizedPct(a))
    .slice(0, 4);
  return [primary, ...supporting].map(synchronizeColorObject);
}

function synchronizeZonePublicationContract(zoneKey, zone = {}) {
  if (isUncertain(zone)) return zone;
  let palette = canonicalPublishedPalette(zone);
  if (!palette.length) return zone;

  // Eyewear masks often contain cheek, clothing, and backdrop pixels around a
  // compact dark frame. A dominant dark frame may retain only nearby dark/
  // neutral evidence unless a secondary has explicit independent ownership.
  if (zoneKey === "eyewear" && normalizedPct(palette[0]) >= 0.6) {
    let primaryLightness = 100;
    try { primaryLightness = chroma(palette[0].hex).lab()[0]; } catch {}
    if (primaryLightness <= 24) {
      palette = [palette[0], ...palette.slice(1).filter((color) => {
        const independentlyOwned = color?.ownership_validated === true
          || color?.ownership_validation?.validated === true;
        return independentlyOwned && normalizedPct(color) >= 0.05 && colorDistance(palette[0].hex, color.hex) <= 18;
      })];
    }
  }

  const primary = palette[0];
  const supporting = palette.slice(1);
  const multicolor = supporting.length > 0;
  const mergeAlias = (existing, fallback) => {
    const permitted = new Set(palette.map((color) => String(color.hex).toUpperCase()));
    const current = Array.isArray(existing) ? existing.map(synchronizeColorObject).filter((color) =>
      color?.hex && (zoneKey !== "eyewear" || permitted.has(String(color.hex).toUpperCase()))
    ) : [];
    return [...current, ...fallback.filter((color) =>
      !current.some((present) => String(present.hex).toUpperCase() === String(color.hex).toUpperCase())
    )];
  };
  const detected = mergeAlias(zone?.detected_colors, palette);
  const regions = mergeAlias(zone?.region_colors, palette);
  const objectLocal = mergeAlias(zone?.object_local_colors, palette);
  const support = mergeAlias(zone?.support_colors, supporting);
  const secondary = mergeAlias(zone?.secondary_colors, supporting);
  const accents = mergeAlias(zone?.accent_colors, supporting.slice(1));
  return {
    ...zone,
    hex: primary.hex,
    dominant_hex: primary.hex,
    dominant_color: primary,
    primary_color: primary,
    signature_color: synchronizeColorObject(zone?.signature_color) || supporting[0] || null,
    support_colors: support,
    secondary_colors: secondary,
    accent_colors: accents,
    detected_colors: detected,
    region_colors: regions,
    object_local_colors: objectLocal,
    interpretation: multicolor ? "multi_color" : "single_color",
    color_mode: multicolor ? "multicolor" : "single_color",
    mode: multicolor ? "multicolor" : "single_color",
    read_mode: multicolor ? "multicolor" : "single_color",
  };
}

function semanticPieceLabel(piece = {}, fallback = "") {
  const raw = String(piece?.subtype || piece?.piece || fallback).trim();
  return raw ? raw.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase()) : null;
}

function applySemanticLayerIdentity(analysis = {}, zones = {}) {
  const pieces = Array.isArray(analysis?.semantic_scene_graph_v1?.pieces)
    ? analysis.semantic_scene_graph_v1.pieces
    : [];
  const outerPiece = pieces.find((piece) => piece?.zone === "outerwear" && piece?.layer_role === "outer" && Number(piece?.confidence || 0) >= 0.75);
  const innerPiece = pieces.find((piece) => piece?.zone === "upper_garment" && piece?.layer_role === "inner" && Number(piece?.confidence || 0) >= 0.75);
  const next = { ...zones };

  // Some legacy consumers call the largest torso mask `upper_garment` and put
  // the independently isolated inner shirt in `body_garment`. When semantics
  // confirms an outer+inner stack, move the measured zone objects rather than
  // copying semantic colors or publishing two aliases for the same pixels.
  if (outerPiece && innerPiece && (!next.outerwear || isUncertain(next.outerwear)) && next.upper_garment && next.body_garment && !isUncertain(next.body_garment)) {
    next.outerwear = {
      ...next.upper_garment,
      garment_type: outerPiece.subtype || outerPiece.piece || "jacket",
      object_type: outerPiece.piece || "outerwear",
      display_zone_label: semanticPieceLabel(outerPiece, "Jacket"),
      semantic_zone_reassignment_v1: { from: "upper_garment", to: "outerwear", measured_values_preserved: true },
    };
    next.upper_garment = {
      ...next.body_garment,
      garment_type: innerPiece.subtype || innerPiece.piece || "shirt",
      object_type: innerPiece.piece || "upper_garment",
      display_zone_label: semanticPieceLabel(innerPiece, "Shirt"),
      semantic_zone_reassignment_v1: { from: "body_garment", to: "upper_garment", measured_values_preserved: true },
    };
    delete next.body_garment;
  }

  for (const [zoneKey, zone] of Object.entries(next)) {
    const piece = pieces
      .filter((candidate) => candidate?.zone === zoneKey && Number(candidate?.confidence || 0) >= 0.75)
      .sort((a, b) => Number(b.confidence || 0) - Number(a.confidence || 0))[0];
    if (!piece || zoneKey.startsWith("accessory_")) continue;
    next[zoneKey] = {
      ...zone,
      garment_type: piece.subtype || piece.piece || zone?.garment_type,
      object_type: piece.piece || zone?.object_type,
      display_zone_label: semanticPieceLabel(piece, zoneKey),
      semantic_identity_authority_v1: "categorical_identity_only",
      external_color_authority: false,
    };
  }
  return next;
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

function enforceMissingLayerMaskSafety(analysis = {}, zones = {}) {
  const pieces = Array.isArray(analysis?.semantic_scene_graph_v1?.pieces)
    ? analysis.semantic_scene_graph_v1.pieces
    : [];
  const hasOuterLayer = pieces.some((piece) => piece?.zone === "outerwear" && piece?.layer_role === "outer" && Number(piece?.confidence || 0) >= 0.75);
  const hasInnerUpper = pieces.some((piece) => piece?.zone === "upper_garment" && piece?.layer_role === "inner" && Number(piece?.confidence || 0) >= 0.75);
  if (!hasOuterLayer || !hasInnerUpper || (zones?.outerwear && !isUncertain(zones.outerwear)) || !zones?.upper_garment) return zones;

  const upper = zones.upper_garment;
  const authorityText = [
    upper?.color_authority_source,
    upper?.canonical_color_authority_v1?.source,
    upper?.primary_color?.source,
    upper?.primary_color?.measurement_source,
  ].filter(Boolean).join(" ").toLowerCase();
  if (/exclusive_mask|sam_mask|target_conditioned/.test(authorityText)) return zones;

  return {
    ...zones,
    upper_garment: sanitizeUncertainZone("upper_garment", {
      ...upper,
      interpretation: "unknown",
      publication_state: "unknown",
      publication_decision: "withhold_unresolved_layer_ownership",
      validation_decision: "rejected",
      validation_reason: "outer_layer_present_without_independent_inner_mask",
      layered_ownership_reconciliation_v1: {
        applied: true,
        withheld: true,
        reason: "outer_layer_present_without_independent_inner_mask",
      },
    }),
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
    publication_state: publicationStateForConfidence(zone, authority?.confidence),
    publication_decision: "publish",
    validation_decision: "accepted",
    color_authority_source: authority.source || "canonical_color_authority_v1",
  };
}

function synchronizeColorObject(color) {
  if (!color?.hex) return color;
  return canonicalizeColorObjectV1(color);
}

function synchronizeColorList(colors) {
  return Array.isArray(colors) ? colors.map(synchronizeColorObject) : colors;
}

function synchronizeCustomerFacingColorAliases(zone = {}) {
  const primaryHex = zone?.primary_color?.hex || zone?.dominant_color?.hex || zone?.hex || zone?.dominant_hex;
  if (!primaryHex || isUncertain(zone)) return zone;
  const canonicalPrimary = synchronizeColorObject({
    ...(zone?.dominant_color || {}),
    ...(zone?.primary_color || {}),
    hex: primaryHex,
  });
  const name = canonicalPrimary?.name || getColorName(primaryHex);
  const sourceIdentity = canonicalPrimary?.color_identity || {};
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
    dominant_color: canonicalPrimary,
    primary_color: canonicalPrimary,
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
  let targetType = item?.type;
  const itemHex = item?.primary_color?.hex || item?.dominant_color?.hex;
  if (itemHex && zones?.outerwear?.semantic_zone_reassignment_v1 && targetType === "upper_garment") {
    const outerHex = zones.outerwear?.primary_color?.hex || zones.outerwear?.dominant_color?.hex || zones.outerwear?.hex;
    if (outerHex && colorDistance(itemHex, outerHex) < 8) targetType = "outerwear";
  }
  const accessoryType = String(item?.accessory_type || item?.object_type || item?.type || "")
    .trim().toLowerCase().replace(/^accessory_/, "").replace(/[^a-z0-9]+/g, "_");
  const zone = zones?.[item?.zone_key] || zones?.[targetType] || zones?.[`accessory_${accessoryType}`];
  if (!zone) return item;
  if (isUncertain(zone)) {
    return {
      ...item,
      ...zone,
      hex: null,
      dominant_hex: null,
      dominant_color: null,
      primary_color: null,
      signature_color: null,
      support_colors: [],
      secondary_colors: [],
      accent_colors: [],
      detected_colors: [],
      region_colors: [],
      object_local_colors: [],
    };
  }

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
    type: targetType,
    confidence: zone?.confidence ?? item?.confidence,
    name: authoritativeName,
    ...(new Set(["upper_garment", "lower_garment", "body_garment", "outerwear"]).has(targetType)
      ? { display_label: zone?.semantic_identity_authority_v1 ? zone?.display_zone_label || authoritativeName : authoritativeName }
      : {}),
    display_zone_label: zone?.display_zone_label || item?.display_zone_label,
    garment_type: zone?.garment_type || item?.garment_type,
    color_mode: zone?.color_mode || item?.color_mode,
    mode: zone?.mode || item?.mode,
    read_mode: zone?.read_mode || item?.read_mode,
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

  const semanticLayerZones = applySemanticLayerIdentity(analysis, enforceLayeredGarmentOwnership(zones));
  const ownershipReconciledZones = Object.fromEntries(Object.entries(enforceMissingLayerMaskSafety(
    analysis,
    semanticLayerZones
  )).map(([key, zone]) => [key, synchronizeZonePublicationContract(key, zone)]));

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
