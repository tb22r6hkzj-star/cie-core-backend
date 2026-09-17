import {
  CANONICAL_SEGMENTATION_ZONES_V1,
  normalizeConfidenceV1,
  normalizePieceIdentityV1,
  segmentationZoneForPieceV1,
} from "./pieceOntologyV1.js";

const GARMENT_ZONES = new Set(["upper_garment", "lower_garment", "body_garment", "outerwear"]);
const SEGMENTATION_ZONES = CANONICAL_SEGMENTATION_ZONES_V1;

function clean(value) {
  return String(value || "").trim().toLowerCase();
}

function confidence(value) {
  return normalizeConfidenceV1(value);
}

function objectFamily(value) {
  const normalized = normalizePieceIdentityV1(value);
  if (["necklace", "pendant"].includes(normalized)) return "necklace";
  if (normalized === "earrings") return "earrings";
  if (/(^|\s)(hat|cap|beanie|headwear)(\s|$)/i.test(String(value || ""))) return "headwear";
  return normalized;
}

function detectorMatchesSemanticPiece(candidate = {}, piece = {}) {
  if (candidate?.zone !== piece?.zone) return false;
  if (piece?.zone !== "accessory_jewelry") return true;
  const detectorFamily = objectFamily(candidate?.detector_label);
  const semanticFamily = objectFamily([piece?.subtype, piece?.piece].filter(Boolean).join(" "));
  return Boolean(detectorFamily && semanticFamily && detectorFamily === semanticFamily);
}

function colorNeutralPrompt(value) {
  return String(value || "")
    .replace(/\b(black|white|gray|grey|brown|beige|red|orange|yellow|green|blue|purple|pink|gold|silver|multicolor)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeSemanticGarmentZoneV1(value, fallback = null) {
  return segmentationZoneForPieceV1(value, fallback);
}

function scheduleTargets(targets, maximumTargets) {
  const max = Math.max(1, Math.min(24, Number(maximumTargets) || 16));
  if (targets.length <= max) return targets;
  const selected = [];
  const remaining = [...targets];
  // First guarantee category coverage, then spend remaining capacity on strong,
  // occluded, layered, and unusual instances instead of confidence alone.
  for (const zone of SEGMENTATION_ZONES) {
    const index = remaining.findIndex((target) => target.zone === zone);
    if (index >= 0 && selected.length < max) selected.push(remaining.splice(index, 1)[0]);
  }
  remaining.sort((a, b) => {
    const risk = (target) => (target.unusual_detail ? 0.12 : 0) + (target.layer_role !== "unknown" && target.layer_role !== "standalone" ? 0.08 : 0);
    return (b.confidence + risk(b)) - (a.confidence + risk(a));
  });
  return [...selected, ...remaining.slice(0, max - selected.length)];
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
      zone: normalizeSemanticGarmentZoneV1([claim?.subtype, claim?.piece].filter(Boolean).join(" "), claim?.zone),
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

export function buildTargetConditionedSegmentationPlanV1({ dinoRegions = [], semanticHandoff = {}, maximumTargets = 16 } = {}) {
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
      .filter((candidate) => !candidate.region_id || !usedDetectorRegionIds.has(candidate.region_id))
      .filter((candidate) => detectorMatchesSemanticPiece(candidate, piece))
      .sort((a, b) => {
        const semanticFamily = objectFamily([piece?.subtype, piece?.piece].filter(Boolean).join(" "));
        const aExact = objectFamily(a.detector_label) === semanticFamily ? 1 : 0;
        const bExact = objectFamily(b.detector_label) === semanticFamily ? 1 : 0;
        return bExact - aExact || b.detector_confidence - a.detector_confidence;
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
    targets: scheduleTargets(targets, maximumTargets),
    candidate_target_count: targets.length,
    target_limit: Math.max(1, Math.min(24, Number(maximumTargets) || 16)),
    omitted_target_count: Math.max(0, targets.length - Math.max(1, Math.min(24, Number(maximumTargets) || 16))),
    scheduling_policy: "category_coverage_then_confidence_and_reasoning_risk",
    scene_graph: graph,
    doctrine: "understand_then_localize_then_mask_then_measure",
  };
}
