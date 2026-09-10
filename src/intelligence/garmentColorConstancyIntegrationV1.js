import chroma from "chroma-js";
import { estimateGarmentIntrinsicColorV1 } from "./garmentColorConstancyV1.js";

const GARMENT_ZONES = new Set(["upper_garment", "lower_garment", "body_garment", "outerwear"]);

function normalizeMode(mode) {
  const value = String(mode || "shadow").toLowerCase();
  return ["off", "shadow", "assist"].includes(value) ? value : "shadow";
}

function safeHex(value) {
  try {
    return chroma(value).hex().toUpperCase();
  } catch {
    return null;
  }
}

function ownedAccentSamples(samples = [], intrinsic = {}) {
  return (Array.isArray(intrinsic?.samples) ? intrinsic.samples : [])
    .map((row, index) => ({ row, sample: samples[index] }))
    .filter(({ row }) => row?.same_material_family === false)
    .map(({ sample }) => sample)
    .filter((sample) => sample?.ownership_validated === true)
    .filter((sample) => Number(sample?.pct ?? sample?.percentage ?? 0) >= 0.04)
    .filter((sample) => safeHex(sample?.hex));
}

function buildPublishableIntrinsicPalette(intrinsic = {}, samples = []) {
  if (!intrinsic?.available || !intrinsic?.stable_material_identity || !intrinsic?.intrinsic_hex) return null;
  const sample = intrinsic?.intrinsic_sample || {};
  const accents = ownedAccentSamples(samples, intrinsic);
  const accentShare = Math.min(0.45, accents.reduce(
    (sum, accent) => sum + Math.max(0, Number(accent?.pct ?? accent?.percentage ?? 0)),
    0
  ));
  const primaryShare = Math.max(0.55, 1 - accentShare);
  return [{
    ...sample,
    hex: intrinsic.intrinsic_hex,
    pct: primaryShare,
    percentage: primaryShare,
    display_pct: primaryShare,
    source: "garment_color_constancy_v1",
    measurement_source: sample?.measurement_source || sample?.source || "measured_intrinsic_medoid",
    ownership_state: "owned",
    traceable_to_pixels: sample?.traceable_to_pixels !== false,
    measurement_authority: "intrinsic_material_medoid",
    intrinsic_material_identity: true,
  }, ...accents.map((accent) => ({
    ...accent,
    hex: safeHex(accent.hex),
    source: "garment_owned_accent_v1",
    measurement_source: accent?.measurement_source || accent?.source || "validated_mask_accent",
    ownership_state: "owned",
    ownership_validated: true,
    measurement_authority: "independent_owned_accent",
    intrinsic_material_identity: false,
  }))];
}

export function applyGarmentColorConstancyIntegrationV1(region = {}, { mode = "shadow" } = {}) {
  const resolvedMode = normalizeMode(mode);
  const zone = String(region?.zone || "");
  const samples = Array.isArray(region?.region_colors) ? region.region_colors : [];
  const oldDominant = region?.dominant_hex || samples?.[0]?.hex || null;

  if (resolvedMode === "off") {
    return {
      ...region,
      color_debug: {
        ...(region?.color_debug || {}),
        garment_color_constancy_v1: {
          mode: "off",
          applied: false,
          previous_dominant_hex: oldDominant,
          raw_region_colors: samples,
          publishable_region_colors: samples,
          selected_intrinsic_hex: null,
          stable_material_identity: false,
          support_ratio: 0,
          chromaticity_spread: 0,
          lightness_spread: 0,
          illumination_variation_detected: false,
          reason: "disabled",
          intrinsic: null,
          policy: {
            off_mode_performs_no_intrinsic_estimation: true,
            raw_measurements_remain_debug_evidence: true,
            customer_facing_palette_uses_intrinsic_material_identity_when_stable: true,
            same_material_light_shadow_variants_do_not_publish_as_separate_colors: true,
          },
        },
      },
    };
  }

  const intrinsic = GARMENT_ZONES.has(zone)
    ? estimateGarmentIntrinsicColorV1(samples)
    : { available: false, reason: "non_garment_zone" };
  const canPromote = Boolean(
    resolvedMode === "assist" &&
    intrinsic?.available &&
    intrinsic?.stable_material_identity &&
    intrinsic?.intrinsic_hex
  );
  const publishablePalette = canPromote ? buildPublishableIntrinsicPalette(intrinsic, samples) : null;

  return {
    ...region,
    dominant_hex: canPromote ? intrinsic.intrinsic_hex : region?.dominant_hex,
    region_colors: canPromote && publishablePalette ? publishablePalette : samples,
    color_debug: {
      ...(region?.color_debug || {}),
      garment_color_constancy_v1: {
        mode: resolvedMode,
        applied: canPromote,
        previous_dominant_hex: oldDominant,
        raw_region_colors: samples,
        publishable_region_colors: publishablePalette || samples,
        selected_intrinsic_hex: intrinsic?.intrinsic_hex || null,
        stable_material_identity: !!intrinsic?.stable_material_identity,
        support_ratio: Number(intrinsic?.support_ratio || 0),
        chromaticity_spread: Number(intrinsic?.chromaticity_spread || 0),
        lightness_spread: Number(intrinsic?.lightness_spread || 0),
        illumination_variation_detected: !!intrinsic?.illumination_variation_detected,
        reason: canPromote
          ? "stable_owned_intrinsic_material_identity"
          : resolvedMode === "shadow"
            ? "shadow_only_no_publication_change"
            : intrinsic?.reason || "intrinsic_identity_not_stable",
        intrinsic,
        policy: {
          off_mode_performs_no_intrinsic_estimation: true,
          raw_measurements_remain_debug_evidence: true,
          customer_facing_palette_uses_intrinsic_material_identity_when_stable: true,
          same_material_light_shadow_variants_do_not_publish_as_separate_colors: true,
          independently_owned_chromatic_accents_survive_constancy: true,
        },
      },
    },
  };
}

export function applyGarmentColorConstancyToRegionsV1(regions = [], options = {}) {
  return (Array.isArray(regions) ? regions : []).map((region) => applyGarmentColorConstancyIntegrationV1(region, options));
}
