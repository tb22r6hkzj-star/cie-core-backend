import { estimateGarmentIntrinsicColorV1 } from "./garmentColorConstancyV1.js";

const GARMENT_ZONES = new Set(["upper_garment", "lower_garment", "body_garment", "outerwear"]);

function normalizeMode(mode) {
  const value = String(mode || "shadow").toLowerCase();
  return ["off", "shadow", "assist"].includes(value) ? value : "shadow";
}

function buildPublishableIntrinsicPalette(intrinsic = {}) {
  if (!intrinsic?.available || !intrinsic?.stable_material_identity || !intrinsic?.intrinsic_hex) return null;
  const sample = intrinsic?.intrinsic_sample || {};
  return [{
    ...sample,
    hex: intrinsic.intrinsic_hex,
    pct: 1,
    percentage: 1,
    display_pct: 1,
    source: "garment_color_constancy_v1",
    measurement_source: sample?.measurement_source || sample?.source || "measured_intrinsic_medoid",
    ownership_state: "owned",
    traceable_to_pixels: sample?.traceable_to_pixels !== false,
    measurement_authority: "intrinsic_material_medoid",
    intrinsic_material_identity: true,
  }];
}

export function applyGarmentColorConstancyIntegrationV1(region = {}, { mode = "shadow" } = {}) {
  const resolvedMode = normalizeMode(mode);
  const zone = String(region?.zone || "");
  const samples = Array.isArray(region?.region_colors) ? region.region_colors : [];
  const intrinsic = GARMENT_ZONES.has(zone)
    ? estimateGarmentIntrinsicColorV1(samples)
    : { available: false, reason: "non_garment_zone" };
  const oldDominant = region?.dominant_hex || samples?.[0]?.hex || null;
  const canPromote = Boolean(
    resolvedMode === "assist" &&
    intrinsic?.available &&
    intrinsic?.stable_material_identity &&
    intrinsic?.intrinsic_hex
  );
  const publishablePalette = canPromote ? buildPublishableIntrinsicPalette(intrinsic) : null;

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
          : resolvedMode !== "assist"
            ? "shadow_only_no_publication_change"
            : intrinsic?.reason || "intrinsic_identity_not_stable",
        intrinsic,
        policy: {
          raw_measurements_remain_debug_evidence: true,
          customer_facing_palette_uses_intrinsic_material_identity_when_stable: true,
          same_material_light_shadow_variants_do_not_publish_as_separate_colors: true,
        },
      },
    },
  };
}

export function applyGarmentColorConstancyToRegionsV1(regions = [], options = {}) {
  return (Array.isArray(regions) ? regions : []).map((region) => applyGarmentColorConstancyIntegrationV1(region, options));
}
