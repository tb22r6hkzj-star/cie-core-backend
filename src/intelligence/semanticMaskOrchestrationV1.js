const GARMENT_ZONES = new Set(["upper_garment", "lower_garment", "body_garment", "outerwear"]);
const ACCESSORY_ZONES = new Set(["footwear", "accessory_jewelry", "belt", "bag"]);
const SEGMENTATION_ZONES = new Set([...GARMENT_ZONES, ...ACCESSORY_ZONES]);

function clean(value) {
  return String(value || "").trim().toLowerCase();
}

function confidence(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n > 1 ? n / 100 : n));
}

function colorNeutralPrompt(value) {
  return String(value || "")
    .replace(/\b(black|white|gray|grey|brown|beige|red|orange|yellow|green|blue|purple|pink|gold|silver|multicolor)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeSemanticGarmentZoneV1(value, fallback = null) {
  const token = clean(value).replace(/[^a-z0-9]+/g, "_");
  const hasToken = (pattern) => new RegExp(`(?:^|_)(?:${pattern})(?:_|$)`).test(token);
  if (hasToken("necklace|pendant|earrings?|bracelets?|watch|rings?|brooch|jewel(?:ry|lery)|chains?")) return "accessory_jewelry";
  if (hasToken("handbag|purse|clutch|satchel|tote|backpack|bag")) return "bag";
  if (hasToken("belt")) return "belt";
  if (hasToken("shoes?|sneakers?|boots?|loafers?|heels?|sandals?|footwear")) return "footwear";
  if (hasToken("jackets?|coats?|outerwear|blazers?|cardigans?|vests?")) return "outerwear";
  if (hasToken("dress|jumpsuit|romper|one_piece")) return "body_garment";
  if (hasToken("shirts?|blouses?|tops?|tee|t_shirt|polo|sweaters?|hoodies?")) return "upper_garment";
  if (hasToken("pants|trousers?|jeans|shorts|skirts?")) return "lower_garment";
  return SEGMENTATION_ZONES.has(fallback) ? fallback : null;
}

function semanticClaims(handoff = {}) {
  return Array.isArray(handoff?.semantic_observation?.claims)
    ? handoff.semantic_observation.claims
    : [];
}

export function buildSemanticSceneGraphV1(handoff = {}) {
  const pieces = semanticClaims(handoff)
    .filter((claim) => claim?.action === "support" && confidence(claim?.confidence) >= 0.65)
    .map((claim, index) => ({
      instance_key: claim?.instance_key || `semantic_piece_${index + 1}`,
      piece: claim?.piece || null,
      subtype: claim?.subtype || null,
      zone: normalizeSemanticGarmentZoneV1(claim?.subtype || claim?.piece, claim?.zone),
      layer_role: claim?.layer_role || "unknown",
      overlaps_instance_keys: Array.isArray(claim?.overlaps_instance_keys) ? claim.overlaps_instance_keys : [],
      occlusion: claim?.occlusion || "unknown",
      unusual_detail: claim?.unusual_detail || null,
      segmentation_prompt: colorNeutralPrompt(claim?.segmentation_prompt || claim?.subtype || claim?.piece) || null,
      confidence: confidence(claim?.confidence),
      authority: "semantic_advisory",
    }));
  return {
    version: "semantic_scene_graph_v1",
    authority_owner: "visioncore",
    external_color_authority: false,
    pieces,
    layered_piece_count: pieces.filter((piece) => piece.layer_role !== "unknown").length,
    unusual_detail_count: pieces.filter((piece) => !!piece.unusual_detail).length,
  };
}

export function buildTargetConditionedSegmentationPlanV1({ dinoRegions = [], semanticHandoff = {} } = {}) {
  const graph = buildSemanticSceneGraphV1(semanticHandoff);
  const candidates = dinoRegions
    .filter((region) => SEGMENTATION_ZONES.has(String(region?.zone || "")))
    .filter((region) => confidence(region?.confidence) >= (GARMENT_ZONES.has(region?.zone) ? 0.45 : 0.15))
    .map((region) => ({
      zone: region.zone,
      detector_label: region?.label || region?.segment_label || region?.category || region.zone,
      detector_confidence: confidence(region?.confidence),
      bbox: region?.bbox || region?.bounding_box || null,
      region_id: region?.id || region?.region_id || null,
    }));

  const targets = [];
  const usedDetectorRegionIds = new Set();
  const semanticPieces = graph.pieces
    .filter((piece) => piece.zone && piece.segmentation_prompt)
    .sort((a, b) => b.confidence - a.confidence);

  // Each semantic instance becomes its own mask target. This deliberately does
  // not collapse two overlapping garments merely because both occupy one zone.
  for (const [index, piece] of semanticPieces.entries()) {
    const selected = candidates
      .filter((candidate) => candidate.zone === piece.zone)
      .sort((a, b) => {
        const aUnused = a.region_id && !usedDetectorRegionIds.has(a.region_id) ? 1 : 0;
        const bUnused = b.region_id && !usedDetectorRegionIds.has(b.region_id) ? 1 : 0;
        return bUnused - aUnused || b.detector_confidence - a.detector_confidence;
      })[0];
    if (selected?.region_id) usedDetectorRegionIds.add(selected.region_id);
    const prompt = piece.segmentation_prompt;
    const stableKey = clean(piece.instance_key || `${piece.zone}_${index + 1}`).replace(/[^a-z0-9_]+/g, "_");
    targets.push({
      id: `target_mask_${stableKey}`,
      zone: piece.zone,
      label: piece.subtype || piece.piece || selected?.detector_label || prompt,
      prompt,
      confidence: Math.max(selected?.detector_confidence || 0, piece.confidence || 0),
      detector_region_id: selected?.region_id || null,
      bbox: selected?.bbox || null,
      semantic_instance_key: piece.instance_key,
      layer_role: piece.layer_role,
      overlaps_instance_keys: piece.overlaps_instance_keys,
      unusual_detail: piece.unusual_detail,
      source: selected ? "semantic_plus_detector" : "semantic_target",
    });
  }

  // Detector-only regions remain useful when the semantic observer is absent,
  // times out, or overlooks an unfamiliar piece. Add one fallback per zone.
  for (const zone of SEGMENTATION_ZONES) {
    if (targets.some((target) => target.zone === zone)) continue;
    const selected = candidates
      .filter((candidate) => candidate.zone === zone)
      .sort((a, b) => b.detector_confidence - a.detector_confidence)[0];
    if (!selected?.detector_label) continue;
    targets.push({
      id: `target_mask_${zone}`,
      zone,
      label: selected.detector_label,
      prompt: selected.detector_label,
      confidence: selected.detector_confidence,
      detector_region_id: selected.region_id,
      bbox: selected.bbox,
      semantic_instance_key: null,
      layer_role: "unknown",
      overlaps_instance_keys: [],
      unusual_detail: null,
      source: "detector_fallback",
    });
  }

  return {
    version: "target_conditioned_segmentation_plan_v1",
    targets: targets.slice(0, 8),
    scene_graph: graph,
    doctrine: "understand_then_localize_then_mask_then_measure",
  };
}
