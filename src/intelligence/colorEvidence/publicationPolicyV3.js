import { fuseColorEvidenceV3 } from "./fusionV3.js";

const DEFAULT_POLICY = Object.freeze({
  supported_score_min: 0.72,
  supported_margin_min: 0.12,
  independent_sources_min: 2,
});

function safeUpperHex(value) {
  const text = String(value || "").trim();
  return /^#[0-9a-f]{6}$/i.test(text) ? text.toUpperCase() : null;
}

export function evaluateColorPublicationV3({
  zoneData = {},
  clusters = [],
  colorEvidence = null,
  currentResolution = null,
  policy = DEFAULT_POLICY,
} = {}) {
  const fusion = fuseColorEvidenceV3({ zoneData, clusters, colorEvidence });
  const currentHex = safeUpperHex(currentResolution?.hex);
  const winnerHex = safeUpperHex(fusion?.winner_hex);

  const passesAuthorityGate =
    fusion?.decision_state === "supported" &&
    Number(fusion?.winner_score || 0) >= Number(policy.supported_score_min) &&
    Number(fusion?.decision_margin || 0) >= Number(policy.supported_margin_min) &&
    Number(fusion?.independent_source_count || 0) >= Number(policy.independent_sources_min) &&
    !!winnerHex;

  if (!passesAuthorityGate) {
    return {
      action: "preserve_current",
      reason: "v3_authority_gate_not_met",
      hex: currentHex,
      source: currentResolution?.source || null,
      fusion,
    };
  }

  if (currentHex && currentHex === winnerHex) {
    return {
      action: "confirm_current",
      reason: "v3_agrees_with_current",
      hex: currentHex,
      source: currentResolution?.source || "color_evidence_v3_confirmed",
      fusion,
    };
  }

  return {
    action: "publish_v3",
    reason: "v3_supported_multi_source_winner",
    hex: winnerHex,
    source: "color_evidence_v3_fusion",
    fusion,
  };
}

export { DEFAULT_POLICY as COLOR_PUBLICATION_V3_POLICY };
