import { classifyMeasuredMetallicPaletteV1 } from "./metallicColorIdentityV1.js";

function token(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeAccessoryType(value) {
  const t = token(value);
  if (/earring|ear_stud/.test(t)) return "earrings";
  if (/watch/.test(t)) return "watch";
  if (/bracelet/.test(t)) return "bracelet";
  if (/(^|_)ring(s)?($|_)/.test(t)) return "ring";
  if (/necklace/.test(t)) return "necklace";
  if (/chain/.test(t)) return "chain";
  if (/pendant/.test(t)) return "pendant";
  if (/brooch/.test(t)) return "brooch";
  if (/pin/.test(t)) return "pin";
  if (/belt/.test(t)) return "belt";
  if (/shoe_hardware|horsebit|metal_shoe_bit/.test(t)) return "shoe_hardware";
  if (/shoe|loafer|sneaker|boot|footwear|heel|sandal/.test(t)) return "footwear";
  if (/bag|handbag|purse|tote|crossbody|backpack/.test(t)) return "bag";
  return t || null;
}

function safeHex(value) {
  const match = String(value || "").trim().match(/^#?([0-9a-f]{6})$/i);
  return match ? `#${match[1].toUpperCase()}` : null;
}

function ownershipDebug(region = {}) {
  return region?.color_debug?.piece_color_ownership_v1 || null;
}

function regionType(region = {}) {
  return normalizeAccessoryType(
    region?.accessory_type ||
    region?.object_type ||
    region?.label ||
    region?.segment_label ||
    region?.zone
  );
}

function instanceType(instance = {}) {
  return normalizeAccessoryType(
    instance?.accessory_type || instance?.object_type || instance?.label || instance?.type
  );
}

function zoneType(zoneKey, zone = {}) {
  return normalizeAccessoryType(
    zone?.accessory_type || zone?.object_type || zone?.label || zone?.type || zone?.display_zone_label || zoneKey
  );
}

function summaryAuthorityRegions(analysis = {}) {
  const authorities = Array.isArray(analysis?.piece_color_ownership_v1?.accessory_color_authorities)
    ? analysis.piece_color_ownership_v1.accessory_color_authorities
    : [];
  return authorities.map((authority) => ({
    id: authority?.id || null,
    region_id: authority?.region_id || null,
    detection_id: authority?.detection_id || null,
    zone: authority?.zone || null,
    label: authority?.label || authority?.type || null,
    accessory_type: authority?.type || null,
    object_type: authority?.type || null,
    confidence: authority?.confidence ?? null,
    dominant_hex: authority?.dominant_hex || null,
    region_colors: Array.isArray(authority?.region_colors) ? authority.region_colors : [],
    color_debug: {
      piece_color_ownership_v1: {
        applied: authority?.applied === true,
        target_type: "accessory",
        reason: authority?.reason || null,
        authority: "post_ownership_summary_lineage",
        doctrine: authority?.doctrine || null,
      },
    },
    post_ownership_summary_authority: true,
  }));
}

function ownershipRegions(analysis = {}) {
  const sources = [
    ...summaryAuthorityRegions(analysis),
    ...(Array.isArray(analysis?.segmented_regions) ? analysis.segmented_regions : []),
    ...(Array.isArray(analysis?.garment_zones?.segmented_regions) ? analysis.garment_zones.segmented_regions : []),
  ];
  const seen = new Set();
  return sources.filter((region) => {
    const id = region?.id || region?.region_id || region?.detection_id || null;
    const key = id || `${regionType(region)}:${safeHex(region?.dominant_hex) || ""}:${region?.confidence || ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return Boolean(ownershipDebug(region));
  });
}

function ownedColors(region = {}) {
  const colors = (Array.isArray(region?.region_colors) ? region.region_colors : [])
    .map((color) => ({
      ...color,
      hex: safeHex(color?.hex),
      pct: Number.isFinite(Number(color?.pct)) ? Number(color.pct) : Number(color?.percentage || 0),
      source: color?.source || "accessory_color_ownership_v1",
      measurement_source: color?.measurement_source || color?.source || "accessory_color_ownership_v1",
      ownership_validated: true,
    }))
    .filter((color) => color.hex);

  const dominant = safeHex(region?.dominant_hex || colors[0]?.hex);
  if (!dominant) return [];
  if (!colors.some((color) => color.hex === dominant)) {
    colors.unshift({
      hex: dominant,
      pct: 1,
      source: "accessory_color_ownership_v1",
      measurement_source: "accessory_color_ownership_v1",
      ownership_validated: true,
    });
  }
  return colors;
}

function chooseRegion(instance, regions = []) {
  const wanted = instanceType(instance);
  if (!wanted) return null;
  const matches = regions.filter((region) => regionType(region) === wanted);
  if (!matches.length) return null;
  return matches.sort((a, b) => {
    if (Boolean(b?.post_ownership_summary_authority) !== Boolean(a?.post_ownership_summary_authority)) {
      return b?.post_ownership_summary_authority ? 1 : -1;
    }
    return Number(b?.confidence || 0) - Number(a?.confidence || 0);
  })[0];
}

function metallicRepresentative(instance, colors = []) {
  const type = instanceType(instance);
  const metallicTypes = new Set(["watch", "necklace", "chain", "pendant", "earrings", "ring", "bracelet", "shoe_hardware"]);
  if (!metallicTypes.has(type) || colors.length < 2) return null;

  const metallic = classifyMeasuredMetallicPaletteV1({
    colors,
    highlightRatio: Number(instance?.metallic_color_evidence_v1?.evidence?.highlight_ratio || instance?.highlight_ratio || 0.08),
    validationSupported: true,
  });
  if (!metallic.publishable || !metallic.representative_hex) return null;
  const representative = colors.find((color) => safeHex(color?.hex) === metallic.representative_hex) || null;
  return representative ? { metallic, representative } : null;
}

function bridgeInstance(instance, region) {
  if (!region) return instance;
  const debug = ownershipDebug(region) || {};
  const applied = debug?.applied === true;
  const colors = applied ? ownedColors(region) : [];

  if (!applied || !colors[0]?.hex) {
    return {
      ...instance,
      object_local_colors: [],
      support_colors: [],
      secondary_colors: [],
      region_colors: [],
      hex: null,
      dominant_color: null,
      primary_color: null,
      color_publication_decision: "withhold_unvalidated_color",
      validation_decision: "identity_only",
      validation_reason: debug?.reason || "accessory_color_ownership_not_validated",
      color_authority_source: "piece_color_ownership_v1",
      stale_accessory_palette_suppressed: true,
    };
  }

  const metal = metallicRepresentative(instance, colors);
  const primary = metal?.representative || colors[0];
  const orderedColors = [primary, ...colors.filter((color) => color !== primary)];

  return {
    ...instance,
    object_local_colors: orderedColors,
    region_colors: orderedColors,
    support_colors: orderedColors.slice(1),
    secondary_colors: orderedColors.slice(1),
    hex: primary.hex,
    dominant_color: primary,
    primary_color: primary,
    material_family: metal?.metallic?.family || instance?.material_family || null,
    material_display_name: metal?.metallic?.display_name || instance?.material_display_name || null,
    metallic_color_evidence_v1: metal?.metallic || instance?.metallic_color_evidence_v1 || null,
    metallic_representative_applied: Boolean(metal),
    metallic_representative_version: metal ? "metallic_representative_v1" : null,
    color_publication_decision: "publish_owned_color",
    validation_decision: "accepted",
    validation_reason: metal ? "validated_accessory_metallic_representative" : "validated_accessory_color_ownership",
    color_authority_source: "piece_color_ownership_v1",
    stale_accessory_palette_suppressed: false,
  };
}

function suppressLegacyJewelryColor(zone = {}, type = null) {
  const jewelry = new Set(["watch", "earrings", "ring", "bracelet", "necklace", "chain", "pendant", "shoe_hardware"]);
  if (!jewelry.has(type)) return zone;
  return {
    ...zone,
    hex: null,
    dominant_hex: null,
    primary_color: null,
    dominant_color: null,
    region_colors: [],
    detected_colors: [],
    secondary_colors: [],
    support_colors: [],
    signature_color: null,
    color_publication_decision: "withhold_unvalidated_color",
    validation_decision: "identity_only",
    validation_reason: "authoritative_accessory_instance_missing_or_withheld",
    stale_accessory_palette_suppressed: true,
    accessory_final_publication_gate_v1: true,
  };
}

function updateVisibleAccessoryZones(originalZones = {}, instances = []) {
  const zones = { ...originalZones };
  for (const [zoneKey, zone] of Object.entries(originalZones)) {
    const type = zoneType(zoneKey, zone);
    const instance = instances.find((candidate) => instanceType(candidate) === type);
    if (instance) {
      zones[zoneKey] = instance;
    } else {
      zones[zoneKey] = suppressLegacyJewelryColor(zone, type);
    }
  }
  for (const instance of instances) {
    if (instance?.zone_key && Object.hasOwn(zones, instance.zone_key)) zones[instance.zone_key] = instance;
  }
  return zones;
}

export function reconcileAccessoryPublicationV1(analysis = {}) {
  if (!analysis || typeof analysis !== "object") return analysis;
  const bundle = analysis?.accessory_instances_v1;
  if (!bundle || !Array.isArray(bundle?.instances)) return analysis;

  const regions = ownershipRegions(analysis);
  const instances = bundle.instances.map((instance) => bridgeInstance(instance, chooseRegion(instance, regions)));
  const byZoneKey = Object.fromEntries(instances.map((instance) => [instance.zone_key, instance]));
  const originalZones = analysis?.garment_zones?.zones || {};
  const zones = updateVisibleAccessoryZones(originalZones, instances);

  return {
    ...analysis,
    accessory_instances_v1: {
      ...bundle,
      instances,
      zones: { ...(bundle?.zones || {}), ...byZoneKey },
      color_published_count: instances.filter((instance) => /publish/.test(String(instance?.color_publication_decision || ""))).length,
      color_withheld_count: instances.filter((instance) => !/publish/.test(String(instance?.color_publication_decision || ""))).length,
      publication_bridge_version: "accessory_publication_bridge_v1",
      publication_lineage_version: "post_ownership_summary_v1",
      metallic_representative_version: "metallic_representative_v1",
    },
    garment_zones: analysis?.garment_zones ? {
      ...analysis.garment_zones,
      zones,
      accessory_instances: instances,
      accessory_publication_bridge_v1: {
        applied: true,
        authority_owner: "visioncore",
        source: "piece_color_ownership_v1",
        lineage_source: "post_ownership_summary_v1",
        visible_zone_matching: "normalized_accessory_identity",
        final_publication_gate_version: "accessory_final_publication_gate_v1",
      },
    } : analysis?.garment_zones,
  };
}

export function reconcileAccessoryPublicationPayloadV1(payload = {}) {
  if (!payload || typeof payload !== "object") return payload;
  if (payload?.outfit_analysis && typeof payload.outfit_analysis === "object") {
    return { ...payload, outfit_analysis: reconcileAccessoryPublicationV1(payload.outfit_analysis) };
  }
  if (payload?.outfitAnalysis && typeof payload.outfitAnalysis === "object") {
    return { ...payload, outfitAnalysis: reconcileAccessoryPublicationV1(payload.outfitAnalysis) };
  }
  return reconcileAccessoryPublicationV1(payload);
}
