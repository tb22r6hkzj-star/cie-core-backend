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
  necklace: "accessory_jewelry",
  necklaces: "accessory_jewelry",
  jewelry: "accessory_jewelry",
  jewellery: "accessory_jewelry",
  chain: "accessory_jewelry",
  chains: "accessory_jewelry",
  watch: "accessory_jewelry",
  sunglasses: "eyewear",
  glasses: "eyewear",
});

function cleanToken(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

export function normalizeSemanticPieceV1(value) {
  const token = cleanToken(value);
  return PIECE_ALIASES[token] || token || null;
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
  if (piece === "accessory_jewelry" && ["accessory", "jewelry", "necklace", "chain", "watch"].some((token) => tokens.has(token))) return true;
  return false;
}

function spatialEvidenceFor(piece, outfitAnalysis = {}) {
  const items = outfitAnalysis?.garment_analysis?.detected_items || [];
  const zones = Object.entries(outfitAnalysis?.garment_zones?.zones || {}).map(([zone, value]) => ({ zone, ...value }));
  const regions = outfitAnalysis?.segmented_regions || [];
  const item = items.find((value) => evidenceSupportsPiece(piece, value));
  const zone = zones.find((value) => evidenceSupportsPiece(piece, value));
  const region = regions.find((value) => evidenceSupportsPiece(piece, value));
  const source = item ? "published_item" : zone ? "visioncore_zone" : region ? "segmented_region" : null;
  const value = item || zone || region;
  return {
    supported: Boolean(source),
    source,
    confidence: Number(value?.confidence ?? value?.score ?? value?.unified_confidence ?? 0),
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
    const spatial = piece ? spatialEvidenceFor(piece, outfitAnalysis) : { supported: false, source: null, confidence: 0 };
    let status = "abstained";
    if (claim?.action === "contradict") status = spatial.supported ? "conflict_review_candidate" : "unsupported_contradiction";
    else if (claim?.action === "request_targeted_reanalysis") status = "targeted_reanalysis_candidate";
    else if (claim?.action === "support" && Number(claim?.confidence || 0) >= 0.75) {
      status = spatial.supported ? "corroborated_shadow_candidate" : "semantic_only_requires_spatial_confirmation";
    }
    return {
      piece,
      proposed_zone: claim?.zone || null,
      action: claim?.action || "abstain",
      semantic_confidence: Number(claim?.confidence || 0),
      spatial_evidence: spatial,
      status,
    };
  });

  return {
    version: "semantic_reconciliation_v1",
    mode: handoff?.mode || "off",
    authority_owner: "visioncore",
    candidates,
    corroborated_count: candidates.filter((candidate) => candidate.status === "corroborated_shadow_candidate").length,
    spatial_confirmation_required_count: candidates.filter((candidate) => candidate.status === "semantic_only_requires_spatial_confirmation").length,
    conflict_count: candidates.filter((candidate) => candidate.status === "conflict_review_candidate").length,
    publication_changed: false,
    color_changed: false,
  };
}
