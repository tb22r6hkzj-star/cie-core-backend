import chroma from "chroma-js";

const GARMENT_ZONE_PRIORITY = Object.freeze({
  body_garment: 0.05,
  lower_garment: 0.04,
  upper_garment: 0.03,
  outerwear: 0.02,
});

function clamp01(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n > 1 ? n / 100 : n));
}

function safeHex(value) {
  try {
    return value ? chroma(value).hex().toUpperCase() : null;
  } catch {
    return null;
  }
}

function cleanFamily(value) {
  const raw = String(value || "").trim().toLowerCase().replace(/[^a-z]+/g, "_").replace(/^_+|_+$/g, "");
  if (!raw) return null;
  const aliases = {
    grey: "gray",
    charcoal: "gray",
    navy: "blue",
    olive: "green",
    forest: "green",
    burgundy: "red",
    maroon: "red",
    tan: "beige",
    cream: "beige",
    ivory: "white",
  };
  return aliases[raw] || raw;
}

export function classifyMeasuredGarmentFamilyV1(hex, hintedFamily = null) {
  const hint = cleanFamily(hintedFamily);
  if (hint && !["neutral", "earth", "unknown", "other"].includes(hint)) return hint;

  const safe = safeHex(hex);
  if (!safe) return hint || null;
  const [hRaw, sRaw, lRaw] = chroma(safe).hsl();
  const h = Number.isFinite(hRaw) ? hRaw : 0;
  const s = Number.isFinite(sRaw) ? sRaw : 0;
  const l = Number.isFinite(lRaw) ? lRaw : 0;
  const [r, g, b] = chroma(safe).rgb();

  if (l <= 0.12) return "black";
  if (l >= 0.92 && s <= 0.12) return "white";

  // Muted garment greens such as #465647 / #4E604F are intentionally kept
  // chromatic. Human color naming can call them muted/forest/olive, but they
  // must not collapse into the generic neutral family merely because saturation
  // is low.
  const greenDominant = g >= r * 1.03 && g >= b * 1.02;
  if ((h >= 65 && h <= 175 && s >= 0.055 && greenDominant) || (greenDominant && g - Math.max(r, b) >= 7)) {
    return "green";
  }

  if (s <= 0.075) return "gray";
  if (h < 15 || h >= 345) return "red";
  if (h < 45) return l < 0.56 ? "brown" : "orange";
  if (h < 68) return "yellow";
  if (h < 175) return "green";
  if (h < 205) return "cyan";
  if (h < 260) return "blue";
  if (h < 315) return "purple";
  return "pink";
}

function candidateFromZone(zoneKey, zone = {}) {
  const primary = zone?.primary_color || zone?.dominant_color || null;
  const hex = safeHex(
    primary?.hex ||
    zone?.signature_color?.hex ||
    zone?.hex ||
    zone?.dominant_hex
  );
  if (!hex) return null;

  const hintedFamily =
    primary?.color_identity?.family ||
    primary?.family ||
    zone?.color_identity?.family ||
    zone?.family ||
    null;
  const family = classifyMeasuredGarmentFamilyV1(hex, hintedFamily);
  const confidence = clamp01(zone?.unified_confidence ?? zone?.calibrated_confidence ?? zone?.confidence ?? zone?.score);
  const coverage = clamp01(
    zone?.coverage ??
    zone?.region_coverage ??
    zone?.color_evidence_v1?.region_purity ??
    zone?.color_evidence_v1?.scene_boundary_purity?.owned_ratio
  );
  const pct = clamp01(primary?.pct ?? primary?.percentage ?? 0);
  const publicationState = String(zone?.publication_state || zone?.publication_decision || "").toLowerCase();
  const published = publicationState === "confirmed" || publicationState === "publish" || publicationState === "published" || publicationState === "";

  const score =
    confidence * 0.56 +
    coverage * 0.31 +
    pct * 0.08 +
    Number(GARMENT_ZONE_PRIORITY[zoneKey] || 0) +
    (published ? 0.04 : -0.12);

  return {
    zone: zoneKey,
    hex,
    name: primary?.name || zone?.name || null,
    family,
    confidence: Number(confidence.toFixed(3)),
    coverage: Number(coverage.toFixed(3)),
    score: Number(score.toFixed(3)),
    source: "published_garment_zone",
  };
}

export function resolveTransformGarmentColorAuthorityV1(outfitAnalysis = {}) {
  const zones = outfitAnalysis?.garment_zones?.zones || {};
  const candidates = Object.keys(GARMENT_ZONE_PRIORITY)
    .map((zoneKey) => candidateFromZone(zoneKey, zones?.[zoneKey] || {}))
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);

  const selected = candidates[0] || null;
  return {
    version: "transform_garment_color_authority_v1",
    authority_owner: "visioncore",
    selected,
    candidates,
    available: Boolean(selected?.hex && selected?.family),
    global_image_color_is_diagnostic_only: true,
  };
}

export function applyTransformGarmentColorAuthorityV1(payload = {}) {
  if (!payload || typeof payload !== "object") return payload;
  const analysis = payload?.outfit_analysis || payload?.outfitAnalysis || null;
  if (!analysis || typeof analysis !== "object") return payload;
  const authority = resolveTransformGarmentColorAuthorityV1(analysis);
  if (!authority.available) return payload;

  return {
    ...payload,
    garmentColorHex: authority.selected.hex,
    garmentColorName: authority.selected.name || payload?.garmentColorName || null,
    garmentColorFamily: authority.selected.family,
    garmentColorAuthorityV1: authority,
  };
}
