import { classifyMeasuredMetallicPaletteV1 } from "./metallicColorIdentityV1.js";

const ACCESSORY_TYPES = new Set([
  "watch", "earrings", "ring", "bracelet", "necklace", "chain", "pendant",
  "belt", "footwear", "shoe_hardware", "bag", "eyewear",
]);
const MICRO_CROP_TYPES = new Set(["watch", "earrings"]);
const METALLIC_TYPES = new Set(["watch", "earrings", "ring", "bracelet", "necklace", "chain", "pendant", "shoe_hardware"]);

function token(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
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
  if (/belt/.test(t)) return "belt";
  if (/shoe_hardware|horsebit|metal_shoe_bit/.test(t)) return "shoe_hardware";
  if (/shoe|loafer|sneaker|boot|footwear|heel|sandal/.test(t)) return "footwear";
  if (/bag|handbag|purse|tote|crossbody|backpack/.test(t)) return "bag";
  if (/eyewear|glasses|sunglasses/.test(t)) return "eyewear";
  return ACCESSORY_TYPES.has(t) ? t : null;
}

function parseHex(hex) {
  const match = String(hex || "").trim().match(/^#?([0-9a-f]{6})$/i);
  if (!match) return null;
  return [0, 2, 4].map((offset) => Number.parseInt(match[1].slice(offset, offset + 2), 16));
}

function rgbTraits(rgb) {
  if (!rgb) return null;
  const [r8, g8, b8] = rgb;
  const r = r8 / 255, g = g8 / 255, b = b8 / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  const lightness = (max + min) / 2;
  const saturation = d === 0 ? 0 : d / (1 - Math.abs(2 * lightness - 1));
  let hue = 0;
  if (d > 0) {
    if (max === r) hue = 60 * (((g - b) / d) % 6);
    else if (max === g) hue = 60 * ((b - r) / d + 2);
    else hue = 60 * ((r - g) / d + 4);
  }
  if (hue < 0) hue += 360;
  return { r: r8, g: g8, b: b8, hue, saturation, lightness };
}

function isSkinLikeHex(hex) {
  const t = rgbTraits(parseHex(hex));
  if (!t) return false;
  return t.hue >= 8 && t.hue <= 48 && t.saturation >= 0.14 && t.saturation <= 0.72 && t.lightness >= 0.30 && t.lightness <= 0.86 && t.r > t.b && t.g > t.b * 0.70;
}

function colorsOf(instance = {}) {
  const rows = instance?.object_local_colors || instance?.region_colors || instance?.detected_colors || [];
  return (Array.isArray(rows) ? rows : []).filter((row) => parseHex(row?.hex));
}

function semanticCandidateFor(type, reconciliation = {}) {
  return (reconciliation?.candidates || []).find((candidate) => normalizeType(candidate?.piece || candidate?.semantic_subtype || candidate?.semantic_label) === type) || null;
}

function semanticMetallicCue(candidate = {}) {
  const family = token(candidate?.color_crosscheck?.openai_hypothesis?.family || candidate?.perceived_color_family);
  const material = token(candidate?.material_cue);
  return family === "metallic_gold" || family === "metallic_silver" || /metal|gold|silver|steel|chrome|brass/.test(material);
}

function measuredFamily(instance = {}) {
  return token(instance?.color_identity?.family || instance?.dominant_color?.color_identity?.family || instance?.material_family || instance?.color_family);
}

function evaluateAccessory(instance = {}, reconciliation = {}) {
  const type = normalizeType(instance?.accessory_type || instance?.object_type || instance?.label || instance?.type || instance?.zone_key);
  if (!type) return null;
  const colors = colorsOf(instance);
  const primaryHex = instance?.hex || instance?.primary_color?.hex || instance?.dominant_color?.hex || colors[0]?.hex || null;
  const confidenceRaw = Number(instance?.unified_confidence ?? instance?.calibrated_confidence ?? instance?.confidence ?? instance?.score ?? 0);
  const confidence = confidenceRaw > 1 ? confidenceRaw / 100 : confidenceRaw;
  const semantic = semanticCandidateFor(type, reconciliation);
  const metallicCue = semanticMetallicCue(semantic);
  const measuredMetallic = METALLIC_TYPES.has(type)
    ? classifyMeasuredMetallicPaletteV1({ colors, highlightRatio: Number(instance?.metallic_color_evidence_v1?.evidence?.highlight_ratio || 0.08), validationSupported: colors.length >= 2 })
    : null;
  const reasons = [];

  if (primaryHex && isSkinLikeHex(primaryHex) && METALLIC_TYPES.has(type)) reasons.push("skin_like_primary_on_metallic_accessory");
  if (confidence > 0 && confidence < 0.62) reasons.push("accessory_confidence_below_trust_floor");
  if (["identity_only", "withhold_unvalidated_color", "withhold_unisolated_color"].includes(token(instance?.validation_decision || instance?.color_publication_decision))) reasons.push("ownership_or_color_not_validated");
  if (colors.length >= 4 && colors.filter((row) => Number(row?.pct || row?.percentage || 0) >= 0.01).length >= 4) reasons.push("noisy_multi_cluster_accessory_palette");
  if (metallicCue && METALLIC_TYPES.has(type) && !measuredMetallic?.publishable) reasons.push("semantic_metallic_cue_without_measured_metallic_support");
  const semanticFamily = token(semantic?.color_crosscheck?.openai_hypothesis?.family);
  const family = measuredFamily(instance);
  if (semanticFamily && family && semanticFamily !== family && Number(semantic?.semantic_confidence || 0) >= 0.85) reasons.push("strong_semantic_measurement_family_disagreement");

  return {
    type,
    instance_id: instance?.instance_id || instance?.zone_key || null,
    primary_hex: primaryHex,
    confidence,
    reasons,
    challenged: reasons.length > 0,
    force_micro_crop: reasons.length > 0 && MICRO_CROP_TYPES.has(type),
    force_remeasurement: reasons.length > 0,
    publication_policy: reasons.length > 0 ? "remeasure_before_publish" : "preserve_current",
    semantic_metallic_cue: metallicCue,
    measured_metallic_publishable: measuredMetallic?.publishable === true,
  };
}

export function buildAccessoryIntelligenceLaneV1({ outfitAnalysis = {}, reconciliation = {} } = {}) {
  const instances = Array.isArray(outfitAnalysis?.accessory_instances_v1?.instances)
    ? outfitAnalysis.accessory_instances_v1.instances
    : [];
  const evaluations = instances.map((instance) => evaluateAccessory(instance, reconciliation)).filter(Boolean);
  const challenges = evaluations.filter((row) => row.challenged);
  const forcedMicroCropTargets = [...new Set(challenges.filter((row) => row.force_micro_crop).map((row) => row.type))];
  return {
    version: "accessory_intelligence_lane_v1",
    authority_owner: "visioncore",
    external_role: "semantic_identity_material_and_spatial_advisory",
    visioncore_role: "pixel_ownership_measurement_and_publication_authority",
    evaluations,
    challenges,
    challenged_count: challenges.length,
    forced_micro_crop_targets: forcedMicroCropTargets,
    forced_remeasurement_targets: [...new Set(challenges.filter((row) => row.force_remeasurement).map((row) => row.type))],
    publication_gate: {
      challenge_requires_remeasurement_before_publish: true,
      unresolved_challenge_behavior: "identity_only_or_withhold_color",
      openai_numeric_color_authority: false,
    },
  };
}
