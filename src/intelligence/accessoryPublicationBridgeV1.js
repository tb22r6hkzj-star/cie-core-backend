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

function ownershipRegions(analysis = {}) {
  const sources = [
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
  return matches.sort((a, b) => Number(b?.confidence || 0) - Number(a?.confidence || 0))[0];
}

function bridgeInstance(instance, region) {
  if (!region) return instance;
  const debug = ownershipDebug(region) || {};
  const applied = debug?.applied === true;
  const colors = applied ? ownedColors(region) : [];
  const primary = colors[0] || null;

  if (!applied || !primary?.hex) {
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

  return {
    ...instance,
    object_local_colors: colors,
    region_colors: colors,
    support_colors: colors.slice(1),
    secondary_colors: colors.slice(1),
    hex: primary.hex,
    dominant_color: primary,
    primary_color: primary,
    color_publication_decision: "publish_owned_color",
    validation_decision: "accepted",
    validation_reason: "validated_accessory_color_ownership",
    color_authority_source: "piece_color_ownership_v1",
    stale_accessory_palette_suppressed: false,
  };
}

/**
 * Makes accessory publication obey the newest pixel-ownership verdict.
 * A stale Perception V6 accessory palette can never override an ownership
 * result that was validated later in the pipeline.
 */
export function reconcileAccessoryPublicationV1(analysis = {}) {
  if (!analysis || typeof analysis !== "object") return analysis;
  const bundle = analysis?.accessory_instances_v1;
  if (!bundle || !Array.isArray(bundle?.instances)) return analysis;

  const regions = ownershipRegions(analysis);
  if (!regions.length) return analysis;

  const instances = bundle.instances.map((instance) => bridgeInstance(instance, chooseRegion(instance, regions)));
  const byZoneKey = Object.fromEntries(instances.map((instance) => [instance.zone_key, instance]));
  const originalZones = analysis?.garment_zones?.zones || {};
  const zones = { ...originalZones };
  for (const instance of instances) {
    if (instance?.zone_key && Object.hasOwn(zones, instance.zone_key)) zones[instance.zone_key] = instance;
  }

  return {
    ...analysis,
    accessory_instances_v1: {
      ...bundle,
      instances,
      zones: { ...(bundle?.zones || {}), ...byZoneKey },
      color_published_count: instances.filter((instance) => /publish/.test(String(instance?.color_publication_decision || ""))).length,
      color_withheld_count: instances.filter((instance) => !/publish/.test(String(instance?.color_publication_decision || ""))).length,
      publication_bridge_version: "accessory_publication_bridge_v1",
    },
    garment_zones: analysis?.garment_zones ? {
      ...analysis.garment_zones,
      zones,
      accessory_instances: instances,
      accessory_publication_bridge_v1: {
        applied: true,
        authority_owner: "visioncore",
        source: "piece_color_ownership_v1",
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
