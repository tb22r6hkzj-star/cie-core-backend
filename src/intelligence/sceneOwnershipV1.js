import chroma from "chroma-js";

const OUTFIT_ZONES = new Set([
  "upper_garment",
  "lower_garment",
  "body_garment",
  "outerwear",
  "footwear",
  "bag",
  "eyewear",
  "accessory_jewelry",
  "headwear",
  "belt",
]);

function safeHex(value) {
  try {
    return chroma(value).hex().toUpperCase();
  } catch {
    return null;
  }
}

function distance(a, b) {
  try {
    return chroma.distance(a, b, "lab");
  } catch {
    return 100;
  }
}

function normalizeColorEntry(entry = {}, extra = {}) {
  const hex = safeHex(entry?.hex || entry?.base || entry?.color || "");
  if (!hex) return null;
  return {
    ...entry,
    ...extra,
    hex,
    pct: Number(entry?.pct ?? entry?.percentage ?? extra?.pct ?? 0) || 0,
  };
}

function pushUnique(target, entry, threshold = 6) {
  if (!entry?.hex) return;
  const match = target.find((existing) => distance(existing.hex, entry.hex) <= threshold);
  if (!match) {
    target.push(entry);
    return;
  }
  if (Number(entry.pct || 0) > Number(match.pct || 0)) {
    Object.assign(match, entry);
  }
}

function certifiedSignature(zone = {}) {
  const signature = zone?.signature_color;
  if (!signature) return null;
  const state = String(signature?.authority_state || "");
  if (state === "owned_secondary") return signature;
  return null;
}

function collectOutfitOwned(authoritativeGarmentZones = {}, garmentAnalysis = {}) {
  const out = [];
  for (const [zoneKey, zone] of Object.entries(authoritativeGarmentZones?.zones || {})) {
    if (!OUTFIT_ZONES.has(zoneKey)) continue;

    // Scene Ownership V1 is intentionally conservative. Published primary/dominant
    // colors are positive outfit evidence. Raw region/detected palettes remain
    // diagnostic unless another layer explicitly certifies ownership.
    const candidates = [
      zone?.primary_color,
      zone?.dominant_color,
      certifiedSignature(zone),
    ].filter(Boolean);

    for (const candidate of candidates) {
      const normalized = normalizeColorEntry(candidate, {
        ownership: "outfit",
        owner_zone: zoneKey,
        source: candidate?.source || "published_zone_authority",
      });
      if (normalized) pushUnique(out, normalized);
    }
  }

  // Accessory/item primary and dominant colors are positively owned by their
  // detected piece; keep them available for outfit-level composition reasoning.
  for (const item of garmentAnalysis?.detected_items || []) {
    if (!OUTFIT_ZONES.has(String(item?.type || ""))) continue;
    const candidates = [item?.primary_color, item?.dominant_color].filter(Boolean);
    for (const candidate of candidates) {
      const normalized = normalizeColorEntry(candidate, {
        ownership: "outfit",
        owner_zone: item.type,
        source: candidate?.source || "detected_item_authority",
      });
      if (normalized) pushUnique(out, normalized);
    }
  }

  return out;
}

function collectSceneContext(authoritativeGarmentZones = {}) {
  const scene = [];
  for (const [zoneKey, zone] of Object.entries(authoritativeGarmentZones?.zones || {})) {
    const pools = [
      ...(Array.isArray(zone?.scene_context_candidates) ? zone.scene_context_candidates : []),
      ...(Array.isArray(zone?.color_evidence_v1?.scene_boundary_purity?.scene_context_candidates)
        ? zone.color_evidence_v1.scene_boundary_purity.scene_context_candidates
        : []),
    ];
    for (const candidate of pools) {
      const normalized = normalizeColorEntry(candidate, {
        ownership: "scene",
        owner_zone: "scene_context",
        source_zone: zoneKey,
        source: candidate?.source || "scene_boundary_context",
      });
      if (normalized) pushUnique(scene, normalized);
    }
  }
  return scene;
}

function classifyGlobalColors(normalizedColors = [], outfitPalette = [], scenePalette = []) {
  const unknown = [];
  for (const color of normalizedColors || []) {
    const normalized = normalizeColorEntry(color, {
      ownership: "unknown",
      source: color?.source || "global_palette",
    });
    if (!normalized) continue;
    if (outfitPalette.some((owned) => distance(owned.hex, normalized.hex) <= 10)) continue;
    if (scenePalette.some((scene) => distance(scene.hex, normalized.hex) <= 10)) continue;
    pushUnique(unknown, normalized);
  }
  return unknown;
}

function reasoningPalette(outfitPalette = []) {
  const ranked = outfitPalette
    .filter((entry) => entry?.hex)
    .slice()
    .sort((a, b) => {
      const zonePriority = (zone) => {
        if (zone === "upper_garment") return 5;
        if (zone === "lower_garment") return 4;
        if (zone === "body_garment" || zone === "outerwear") return 3;
        if (zone === "footwear" || zone === "bag" || zone === "belt") return 2;
        return 1;
      };
      const priorityDelta = zonePriority(b.owner_zone) - zonePriority(a.owner_zone);
      if (priorityDelta) return priorityDelta;
      return Number(b.pct || 0) - Number(a.pct || 0);
    });

  const out = [];
  for (const entry of ranked) {
    if (out.some((existing) => distance(existing.hex, entry.hex) <= 10)) continue;
    out.push({
      ...entry,
      source_zone: entry.owner_zone,
      source: "scene_ownership_v1_outfit",
    });
    if (out.length >= 6) break;
  }
  return out;
}

export function buildSceneOwnershipV1({
  authoritativeGarmentZones = {},
  garmentAnalysis = {},
  normalizedColors = [],
} = {}) {
  const outfitPalette = collectOutfitOwned(authoritativeGarmentZones, garmentAnalysis);
  const scenePalette = collectSceneContext(authoritativeGarmentZones);
  const unknownPalette = classifyGlobalColors(normalizedColors, outfitPalette, scenePalette);
  const ownedReasoningPalette = reasoningPalette(outfitPalette);

  return {
    version: "scene_ownership_v1",
    ownership_map: {
      outfit: outfitPalette,
      person: [],
      scene: scenePalette,
      unknown: unknownPalette,
    },
    outfit_palette: ownedReasoningPalette,
    scene_palette: scenePalette,
    person_palette: [],
    unknown_palette: unknownPalette,
    policy: {
      detection_implies_ownership: false,
      ownership_implies_outfit_membership: false,
      scene_context_can_vote_as_garment_truth: false,
      raw_region_colors_are_positive_outfit_ownership: false,
      unknown_global_colors_can_vote_as_outfit_reasoning: false,
      outfit_reasoning_requires_positive_outfit_ownership: true,
    },
  };
}
