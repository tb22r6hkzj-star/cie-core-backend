const PIECE_ALIASES = Object.freeze({
  shirt: "upper_garment",
  top: "upper_garment",
  polo: "upper_garment",
  sweater: "upper_garment",
  pants: "lower_garment",
  trousers: "lower_garment",
  jeans: "lower_garment",
  shoes: "footwear",
  shoe: "footwear",
  loafers: "footwear",
  loafer: "footwear",
  necklace: "necklace",
  necklaces: "necklace",
  chain: "necklace",
  chains: "necklace",
  watch: "watch",
  watches: "watch",
  earring: "earrings",
  earrings: "earrings",
  ring: "ring",
  rings: "ring",
  bracelet: "bracelet",
  bracelets: "bracelet",
  jewelry: "accessory_jewelry",
  jewellery: "accessory_jewelry",
  sunglasses: "eyewear",
  glasses: "eyewear",
});

function cleanToken(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function normalizedConfidence(value) {
  const confidence = Number(value || 0);
  if (!Number.isFinite(confidence)) return 0;
  return Math.max(0, Math.min(1, confidence > 1 ? confidence / 100 : confidence));
}

const COLOR_FAMILY_ALIASES = Object.freeze({
  charcoal: "gray",
  grey: "gray",
  silver: "metallic_silver",
  gold: "metallic_gold",
  navy: "blue",
  olive: "green",
  cream: "beige",
  ivory: "white",
  tan: "beige",
  burgundy: "red",
  maroon: "red",
  teal: "blue",
  violet: "purple",
});

export function normalizeSemanticColorFamilyV1(value) {
  const color = cleanToken(value);
  if (!color) return null;
  if (COLOR_FAMILY_ALIASES[color]) return COLOR_FAMILY_ALIASES[color];
  for (const [alias, family] of Object.entries(COLOR_FAMILY_ALIASES)) {
    if (color.includes(alias)) return family;
  }
  return [
    "black", "white", "gray", "brown", "beige", "red", "orange", "yellow",
    "green", "blue", "purple", "pink", "metallic_gold", "metallic_silver", "multicolor", "unclear",
  ].find((family) => color === family || color.includes(family)) || color;
}

function measuredColorEvidence(value = {}) {
  const color = value?.primary_color || value?.dominant_color || value?.selected_color || null;
  const family = normalizeSemanticColorFamilyV1(
    color?.color_identity?.family || color?.family || value?.color_identity?.family || value?.color_family
  );
  const hex = color?.hex || value?.dominant_hex || null;
  return {
    available: Boolean(family || hex),
    family,
    hex,
    confidence: normalizedConfidence(value?.unified_confidence ?? value?.calibrated_confidence ?? value?.confidence ?? value?.score),
    source: family || hex ? "visioncore_object_local_measurement" : null,
  };
}

function buildColorCrosscheck(claim = {}, spatial = {}, mode = "off") {
  const perceivedFamily = normalizeSemanticColorFamilyV1(claim?.perceived_color_family);
  const semanticConfidence = normalizedConfidence(claim?.color_confidence);
  const measurement = spatial?.color_measurement || measuredColorEvidence();
  const base = {
    version: "semantic_color_crosscheck_v1",
    openai_hypothesis: {
      family: perceivedFamily,
      appearance_cue: claim?.color_appearance_cue || null,
      lighting_cue: claim?.lighting_cue || null,
      confidence: semanticConfidence,
      numeric_color_supplied: false,
    },
    visioncore_measurement: measurement,
    authority_owner: "visioncore",
    external_color_authority: false,
    measured_hex_changed: false,
    remeasurement_requested: false,
  };
  if (!perceivedFamily || perceivedFamily === "unclear") return { ...base, disposition: "semantic_color_abstained" };
  if (!measurement?.available || !measurement?.family) return { ...base, disposition: "visioncore_measurement_unavailable" };
  if (perceivedFamily === measurement.family) return { ...base, disposition: "independent_color_family_corroboration" };
  if (measurement.confidence >= 0.8) return { ...base, disposition: "visioncore_strong_measurement_preserved" };
  if (semanticConfidence >= 0.9 && mode === "assist") {
    return { ...base, disposition: "targeted_visioncore_remeasurement_requested", remeasurement_requested: true };
  }
  return { ...base, disposition: "color_disagreement_recorded" };
}

export function normalizeSemanticPieceV1(value) {
  const token = cleanToken(value);
  if (PIECE_ALIASES[token]) return PIECE_ALIASES[token];
  if (/(shirt|polo|blouse|sweater|hoodie|top)/.test(token)) return "upper_garment";
  if (/(trouser|pants|jeans|shorts|skirt)/.test(token)) return "lower_garment";
  if (/(shoe|loafer|sneaker|boot|footwear|heel|sandal)/.test(token)) return "footwear";
  if (/(necklace|chain|pendant)/.test(token)) return "necklace";
  if (/(earring|ear_stud)/.test(token)) return "earrings";
  if (/(bracelet)/.test(token)) return "bracelet";
  if (/(watch)/.test(token)) return "watch";
  if (/(^|_)ring(s)?($|_)/.test(token)) return "ring";
  if (/(jewel)/.test(token)) return "accessory_jewelry";
  if (/(eyewear|glasses|sunglasses)/.test(token)) return "eyewear";
  if (/(belt)/.test(token)) return "belt";
  return token || null;
}

function evidenceTokens(value = {}) {
  return [value?.type, value?.zone, value?.label, value?.category, value?.garment_type, value?.object_type, value?.accessory_type]
    .flatMap((entry) => String(entry || "").toLowerCase().split(/[^a-z0-9]+/))
    .filter(Boolean);
}

function evidenceSupportsPiece(piece, value = {}) {
  const tokens = new Set(evidenceTokens(value));
  const normalizedValues = [value?.type, value?.zone, value?.label, value?.category, value?.garment_type, value?.object_type, value?.accessory_type]
    .map(normalizeSemanticPieceV1)
    .filter(Boolean);
  if (tokens.has(piece) || normalizedValues.includes(piece)) return true;
  for (const [alias, canonical] of Object.entries(PIECE_ALIASES)) {
    if (canonical === piece && tokens.has(alias)) return true;
  }
  if (piece === "accessory_jewelry" && ["accessory", "jewelry"].some((token) => tokens.has(token))) return true;
  return false;
}

function spatialEvidenceFor(piece, outfitAnalysis = {}) {
  if (piece === "belt") {
    const belt = (outfitAnalysis?.belt_localization_v1?.candidates || []).find((candidate) =>
      candidate?.validated === true ||
      (candidate?.semantic_match === true && candidate?.confidence_valid === true && candidate?.geometry_valid === true)
    );
    return {
      supported: Boolean(belt),
      source: belt ? (belt?.validated ? "dino_sam_belt_localization_v1" : "dino_waist_geometry_v1") : null,
      confidence: Number(belt?.confidence || 0),
      color_measurement: measuredColorEvidence(belt),
    };
  }
  const items = outfitAnalysis?.garment_analysis?.detected_items || [];
  const zones = Object.entries(outfitAnalysis?.garment_zones?.zones || {}).map(([zone, value]) => ({ zone, ...value }));
  const regions = outfitAnalysis?.segmented_regions || [];
  const item = items.find((value) => evidenceSupportsPiece(piece, value));
  const zone = zones.find((value) => evidenceSupportsPiece(piece, value));
  const region = regions.find((value) => evidenceSupportsPiece(piece, value));
  const matches = [
    { value: item, source: "published_item" },
    { value: zone, source: "visioncore_zone" },
    { value: region, source: "segmented_region" },
  ].filter((match) => match.value);
  // Prefer the matching VisionCore record that actually carries a measured
  // color family. Identity corroboration still uses the first spatial match.
  const selected = matches.find((match) => measuredColorEvidence(match.value).family) || matches[0] || {};
  const source = selected.source || null;
  const value = selected.value;
  return {
    supported: Boolean(source),
    source,
    confidence: Number(value?.confidence ?? value?.score ?? value?.unified_confidence ?? 0),
    color_measurement: measuredColorEvidence(value),
  };
}

/**
 * Converts external semantic observations into bounded, record-only candidates.
 * It intentionally returns no color, score, mask, or publication replacement.
 */
export function reconcileExternalSemanticsV1({ handoff = {}, outfitAnalysis = {} } = {}) {
  const claims = Array.isArray(handoff?.semantic_observation?.claims) ? handoff.semantic_observation.claims : [];
  const candidates = claims.slice(0, 24).map((claim) => {
    const piece = normalizeSemanticPieceV1(claim?.piece);
    const spatial = piece ? spatialEvidenceFor(piece, outfitAnalysis) : { supported: false, source: null, confidence: 0, color_measurement: measuredColorEvidence() };
    const colorCrosscheck = buildColorCrosscheck(claim, spatial, handoff?.mode || "off");
    let status = "abstained";
    if (claim?.action === "contradict") status = spatial.supported ? "conflict_review_candidate" : "unsupported_contradiction";
    else if (claim?.action === "request_targeted_reanalysis") status = "targeted_reanalysis_candidate";
    else if (claim?.action === "support" && Number(claim?.confidence || 0) >= 0.75) {
      status = spatial.supported ? "corroborated_shadow_candidate" : "semantic_only_requires_spatial_confirmation";
    }
    return {
      piece,
      semantic_label: claim?.piece || null,
      semantic_subtype: claim?.subtype || null,
      instance_key: claim?.instance_key || null,
      visible_count: Number.isInteger(claim?.visible_count) ? claim.visible_count : null,
      component_of: claim?.component_of || null,
      material_cue: claim?.material_cue || null,
      color_crosscheck: colorCrosscheck,
      proposed_zone: claim?.zone || null,
      action: claim?.action || "abstain",
      semantic_confidence: Number(claim?.confidence || 0),
      spatial_evidence: spatial,
      status,
    };
  });

  const semanticallyAddressed = new Set(candidates.map((candidate) => candidate.piece).filter(Boolean));
  for (const item of outfitAnalysis?.garment_analysis?.detected_items || []) {
    const piece = normalizeSemanticPieceV1(item?.type);
    if (!piece || semanticallyAddressed.has(piece)) continue;
    candidates.push({
      piece,
      proposed_zone: item?.type || null,
      action: "inventory_omission",
      semantic_confidence: Number(handoff?.semantic_observation?.overall_confidence || 0),
      spatial_evidence: spatialEvidenceFor(piece, outfitAnalysis),
      status: "semantic_inventory_omission_review",
    });
  }

  return {
    version: "semantic_reconciliation_v1",
    mode: handoff?.mode || "off",
    authority_owner: "visioncore",
    candidates,
    corroborated_count: candidates.filter((candidate) => candidate.status === "corroborated_shadow_candidate").length,
    spatial_confirmation_required_count: candidates.filter((candidate) => candidate.status === "semantic_only_requires_spatial_confirmation").length,
    conflict_count: candidates.filter((candidate) => candidate.status === "conflict_review_candidate").length,
    inventory_omission_review_count: candidates.filter((candidate) => candidate.status === "semantic_inventory_omission_review").length,
    color_corroboration_count: candidates.filter((candidate) => candidate?.color_crosscheck?.disposition === "independent_color_family_corroboration").length,
    color_disagreement_count: candidates.filter((candidate) => ["visioncore_strong_measurement_preserved", "targeted_visioncore_remeasurement_requested", "color_disagreement_recorded"].includes(candidate?.color_crosscheck?.disposition)).length,
    targeted_color_remeasurement_requested: candidates.some((candidate) => candidate?.color_crosscheck?.remeasurement_requested === true),
    publication_changed: false,
    color_changed: false,
  };
}
