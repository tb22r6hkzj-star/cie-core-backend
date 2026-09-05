const JEWELRY_TYPES = new Set([
  "watch", "earrings", "ring", "bracelet", "necklace", "chain", "pendant", "shoe_hardware",
]);

function token(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeType(value) {
  const t = token(value);
  if (/earring|ear_stud/.test(t)) return "earrings";
  if (/watch/.test(t)) return "watch";
  if (/bracelet/.test(t)) return "bracelet";
  if (/(^|_)ring(s)?($|_)/.test(t)) return "ring";
  if (/necklace/.test(t)) return "necklace";
  if (/chain/.test(t)) return "chain";
  if (/pendant/.test(t)) return "pendant";
  if (/shoe_hardware|horsebit|metal_shoe_bit/.test(t)) return "shoe_hardware";
  return t || null;
}

function typeOf(value = {}, fallback = null) {
  return normalizeType(
    value?.accessory_type || value?.object_type || value?.label || value?.type || value?.display_zone_label || fallback
  );
}

function identityName(type) {
  const names = {
    watch: "Watch",
    earrings: "Earrings",
    ring: "Ring",
    bracelet: "Bracelet",
    necklace: "Necklace",
    chain: "Chain",
    pendant: "Pendant",
    shoe_hardware: "Shoe Hardware",
  };
  return names[type] || "Accessory";
}

function safeHex(value) {
  const match = String(value || "").trim().match(/^#?([0-9a-f]{6})$/i);
  return match ? `#${match[1].toUpperCase()}` : null;
}

function normalizedPalette(instance = {}, primaryHex = null) {
  const source = [
    ...(Array.isArray(instance?.object_local_colors) ? instance.object_local_colors : []),
    ...(Array.isArray(instance?.region_colors) ? instance.region_colors : []),
  ];
  const seen = new Set();
  const colors = [];
  for (const row of source) {
    const hex = safeHex(row?.hex);
    if (!hex || seen.has(hex)) continue;
    seen.add(hex);
    colors.push({ ...row, hex, ownership_validated: true });
  }
  if (primaryHex && !seen.has(primaryHex)) colors.unshift({ hex: primaryHex, pct: 1, ownership_validated: true });
  if (primaryHex) colors.sort((a, b) => (a.hex === primaryHex ? -1 : b.hex === primaryHex ? 1 : 0));
  return colors;
}

function canonicalizeInstance(instance = {}) {
  const type = typeOf(instance);
  if (!JEWELRY_TYPES.has(type)) return instance;

  const decision = String(instance?.color_publication_decision || "");
  const primaryHex = safeHex(instance?.primary_color?.hex || instance?.hex || instance?.dominant_color?.hex || instance?.dominant_hex);
  const publish = /publish/.test(decision) && Boolean(primaryHex);
  const name = identityName(type);

  if (!publish) {
    return {
      ...instance,
      name,
      display_name: name,
      hex: null,
      dominant_hex: null,
      primary_color: null,
      dominant_color: null,
      signature_color: null,
      color_identity: null,
      object_local_colors: [],
      region_colors: [],
      detected_colors: [],
      secondary_colors: [],
      support_colors: [],
      accent_colors: [],
      validation_decision: "identity_only",
      color_publication_decision: decision || "withhold_unvalidated_color",
      stale_accessory_palette_suppressed: true,
      accessory_canonical_publication_v2: {
        applied: true,
        state: "withheld",
        authority_owner: "visioncore",
      },
    };
  }

  const palette = normalizedPalette(instance, primaryHex);
  const primary = { ...(palette[0] || instance?.primary_color || {}), hex: primaryHex, ownership_validated: true };
  const rest = palette.filter((row) => row.hex !== primaryHex);

  return {
    ...instance,
    name,
    display_name: name,
    hex: primaryHex,
    dominant_hex: primaryHex,
    primary_color: primary,
    dominant_color: primary,
    signature_color: primary,
    object_local_colors: [primary, ...rest],
    region_colors: [primary, ...rest],
    detected_colors: [primary, ...rest],
    secondary_colors: rest,
    support_colors: rest,
    accent_colors: [],
    stale_accessory_palette_suppressed: true,
    accessory_canonical_publication_v2: {
      applied: true,
      state: "published",
      authority_owner: "visioncore",
      canonical_hex: primaryHex,
      source: instance?.color_authority_source || "piece_color_ownership_v1",
    },
  };
}

function canonicalizeAnalysis(analysis = {}) {
  if (!analysis || typeof analysis !== "object") return analysis;
  const bundle = analysis?.accessory_instances_v1;
  if (!bundle || !Array.isArray(bundle?.instances)) return analysis;

  const instances = bundle.instances.map(canonicalizeInstance);
  const byType = new Map(instances.map((instance) => [typeOf(instance), instance]));
  const byZoneKey = Object.fromEntries(instances.filter((instance) => instance?.zone_key).map((instance) => [instance.zone_key, instance]));

  const originalZones = analysis?.garment_zones?.zones || {};
  const zones = Object.fromEntries(Object.entries(originalZones).map(([zoneKey, zone]) => {
    const type = typeOf(zone, zoneKey);
    const canonical = JEWELRY_TYPES.has(type) ? byType.get(type) : null;
    return [zoneKey, canonical || zone];
  }));

  return {
    ...analysis,
    accessory_instances_v1: {
      ...bundle,
      instances,
      zones: { ...(bundle?.zones || {}), ...byZoneKey },
      canonical_publication_version: "accessory_canonical_publication_v2",
    },
    garment_zones: analysis?.garment_zones ? {
      ...analysis.garment_zones,
      zones,
      accessory_instances: instances,
      accessory_canonical_publication_v2: {
        applied: true,
        authority_owner: "visioncore",
        doctrine: "one_accessory_color_authority_rewrites_all_customer_facing_aliases",
      },
    } : analysis?.garment_zones,
  };
}

export function applyAccessoryCanonicalPublicationV2(payload = {}) {
  if (!payload || typeof payload !== "object") return payload;
  if (payload?.outfit_analysis && typeof payload.outfit_analysis === "object") {
    return { ...payload, outfit_analysis: canonicalizeAnalysis(payload.outfit_analysis) };
  }
  if (payload?.outfitAnalysis && typeof payload.outfitAnalysis === "object") {
    return { ...payload, outfitAnalysis: canonicalizeAnalysis(payload.outfitAnalysis) };
  }
  return canonicalizeAnalysis(payload);
}

export { canonicalizeInstance };
