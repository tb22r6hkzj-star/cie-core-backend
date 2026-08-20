import chroma from "chroma-js";

const GARMENT_ZONES = new Set(["upper_garment", "lower_garment", "body_garment", "outerwear"]);

function safeHex(value) {
  try {
    return chroma(value).hex().toUpperCase();
  } catch {
    return null;
  }
}

function normalizePct(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n > 1 ? n / 100 : n));
}

function findMatchingColor(zone = {}, hex) {
  const target = safeHex(hex);
  if (!target) return null;
  const pools = [
    ...(Array.isArray(zone?.region_colors) ? zone.region_colors : []),
    ...(Array.isArray(zone?.detected_colors) ? zone.detected_colors : []),
    ...(Array.isArray(zone?.secondary_colors) ? zone.secondary_colors : []),
    ...(Array.isArray(zone?.support_colors) ? zone.support_colors : []),
    ...(Array.isArray(zone?.accent_colors) ? zone.accent_colors : []),
  ];
  return pools.find((color) => safeHex(color?.hex || color?.base || "") === target) || null;
}

function primarySignature(zone = {}, reason) {
  const primary = zone?.primary_color || zone?.dominant_color || (zone?.hex ? { hex: zone.hex } : null);
  const hex = safeHex(primary?.hex || zone?.hex || "");
  if (!hex) return null;
  return {
    ...(primary || {}),
    hex,
    reason,
    source: "signature_color_authority_v2",
    authority_state: "primary_fallback",
  };
}

function lowerGarmentSecondaryIsOwned(candidate = {}) {
  const source = String(candidate?.source || "");
  if (source !== "lower_garment_purity_v2") return false;
  const bodyShare = Number(candidate?.body_share);
  const separatorShare = Number(candidate?.separator_share);
  const spatialPenalty = Number(candidate?.spatial_penalty);
  if (![bodyShare, separatorShare, spatialPenalty].every(Number.isFinite)) return false;
  return bodyShare >= 0.45 && separatorShare <= 0.32 && spatialPenalty >= 0.8;
}

export function reconcileSignatureColorV2(zoneKey, zone = {}) {
  if (!GARMENT_ZONES.has(String(zoneKey || ""))) return zone;
  const existing = zone?.signature_color || null;
  const existingHex = safeHex(existing?.hex || "");
  const primaryHex = safeHex(zone?.primary_color?.hex || zone?.dominant_color?.hex || zone?.hex || "");
  if (!primaryHex) return zone;

  if (!existingHex || existingHex === primaryHex) {
    return {
      ...zone,
      signature_color: existingHex ? { ...existing, hex: existingHex } : primarySignature(zone, "No independently supported secondary signature color; signature follows authoritative primary."),
      signature_color_authority_v2: {
        applied: true,
        decision: existingHex ? "preserve_primary_signature" : "fallback_to_primary",
        primary_hex: primaryHex,
        candidate_hex: existingHex,
      },
    };
  }

  if (zoneKey !== "lower_garment") {
    return {
      ...zone,
      signature_color_authority_v2: {
        applied: false,
        decision: "non_lower_zone_passthrough",
        primary_hex: primaryHex,
        candidate_hex: existingHex,
      },
    };
  }

  const candidate = findMatchingColor(zone, existingHex);
  const candidatePct = normalizePct(candidate?.pct ?? candidate?.percentage ?? existing?.pct ?? existing?.percentage);
  const owned = candidate ? lowerGarmentSecondaryIsOwned(candidate) : false;

  if (owned && candidatePct >= 0.12) {
    return {
      ...zone,
      signature_color: {
        ...existing,
        ...candidate,
        hex: existingHex,
        reason: "Meaningful secondary color with garment-body spatial support.",
        source: "signature_color_authority_v2",
        authority_state: "owned_secondary",
      },
      signature_color_authority_v2: {
        applied: true,
        decision: "preserve_owned_secondary",
        primary_hex: primaryHex,
        candidate_hex: existingHex,
        candidate_pct: candidatePct,
        body_share: Number(candidate?.body_share || 0),
        separator_share: Number(candidate?.separator_share || 0),
        spatial_penalty: Number(candidate?.spatial_penalty || 0),
      },
    };
  }

  return {
    ...zone,
    signature_color: primarySignature(zone, "Secondary candidate lacked sufficient garment-body spatial support; signature follows authoritative primary."),
    signature_color_authority_v2: {
      applied: true,
      decision: "reject_unowned_secondary",
      primary_hex: primaryHex,
      candidate_hex: existingHex,
      candidate_pct: candidatePct,
      body_share: Number(candidate?.body_share || 0),
      separator_share: Number(candidate?.separator_share || 0),
      spatial_penalty: Number(candidate?.spatial_penalty || 0),
    },
  };
}

export function applySignatureColorAuthorityV2(zones = {}) {
  return Object.fromEntries(
    Object.entries(zones || {}).map(([zoneKey, zone]) => [zoneKey, reconcileSignatureColorV2(zoneKey, zone)])
  );
}
