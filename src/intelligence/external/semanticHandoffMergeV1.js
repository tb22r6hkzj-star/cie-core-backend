import { cleanPieceTokenV1, normalizeConfidenceV1, normalizePieceIdentityV1 } from "../pieceOntologyV1.js";

function claimsFrom(handoff = {}) {
  return Array.isArray(handoff?.semantic_observation?.claims) ? handoff.semantic_observation.claims : [];
}

function claimKey(claim = {}, index = 0) {
  const explicit = cleanPieceTokenV1(claim?.instance_key);
  if (explicit) return explicit;
  const piece = normalizePieceIdentityV1([claim?.subtype, claim?.piece, claim?.zone].filter(Boolean).join(" ")) || "piece";
  return `${piece}_${index + 1}`;
}

function substantive(value) {
  return value !== null && value !== undefined && value !== "" && value !== "unknown";
}

function mergeClaim(scene = {}, color = {}) {
  const merged = { ...scene };
  for (const [key, value] of Object.entries(color)) {
    if (substantive(value) || !substantive(merged[key])) merged[key] = value;
  }
  // Scene observation owns geometry and instance structure. Color observation
  // may enrich appearance, but cannot erase those relationships.
  for (const key of ["subtype", "component_of", "material_cue", "layer_role", "overlaps_instance_keys", "occlusion", "unusual_detail", "segmentation_prompt", "visible_count"]) {
    if (substantive(scene[key])) merged[key] = scene[key];
  }
  merged.instance_key = scene?.instance_key || color?.instance_key || null;
  merged.confidence = Math.max(normalizeConfidenceV1(scene?.confidence), normalizeConfidenceV1(color?.confidence));
  for (const key of [
    "hex", "rgb", "lab", "hsl", "color_percentage", "percentage", "pct",
    "score", "publication_state", "publication_decision", "dominant_color",
    "primary_color", "secondary_colors", "support_colors", "accent_colors",
  ]) delete merged[key];
  return merged;
}

function bestMatch(colorClaim, sceneRows, used) {
  const explicit = cleanPieceTokenV1(colorClaim?.instance_key);
  if (explicit) {
    const exact = sceneRows.find((row) => !used.has(row.index) && cleanPieceTokenV1(row.claim?.instance_key) === explicit);
    if (exact) return exact;
  }
  const colorPiece = normalizePieceIdentityV1([colorClaim?.piece, colorClaim?.zone].filter(Boolean).join(" "));
  return sceneRows.find((row) => !used.has(row.index) && normalizePieceIdentityV1([row.claim?.subtype, row.claim?.piece, row.claim?.zone].filter(Boolean).join(" ")) === colorPiece) || null;
}

export function mergeExternalSemanticHandoffsV1({ sceneHandoff = {}, colorHandoff = {} } = {}) {
  const sceneClaims = claimsFrom(sceneHandoff);
  const colorClaims = claimsFrom(colorHandoff);
  const sceneRows = sceneClaims.map((claim, index) => ({ claim, index, key: claimKey(claim, index) }));
  const used = new Set();
  const mergedClaims = [];

  for (const colorClaim of colorClaims) {
    const match = bestMatch(colorClaim, sceneRows, used);
    if (match) used.add(match.index);
    mergedClaims.push(mergeClaim(match?.claim || {}, colorClaim));
  }
  for (const row of sceneRows) {
    if (!used.has(row.index)) mergedClaims.push(mergeClaim(row.claim, {}));
  }

  const base = colorHandoff?.semantic_observation ? colorHandoff : sceneHandoff;
  return {
    ...base,
    mode: colorHandoff?.mode || sceneHandoff?.mode || "off",
    semantic_observation: {
      ...(base?.semantic_observation || {}),
      schema_version: "unified_1",
      overall_confidence: Math.max(
        normalizeConfidenceV1(sceneHandoff?.semantic_observation?.overall_confidence),
        normalizeConfidenceV1(colorHandoff?.semantic_observation?.overall_confidence)
      ),
      claims: mergedClaims.slice(0, 32),
    },
    semantic_sources_v1: {
      scene_claim_count: sceneClaims.length,
      color_claim_count: colorClaims.length,
      unified_claim_count: mergedClaims.length,
      geometry_source: "segmentation_scene",
      appearance_source: "color_lighting",
      numeric_color_authority: "visioncore",
    },
  };
}
