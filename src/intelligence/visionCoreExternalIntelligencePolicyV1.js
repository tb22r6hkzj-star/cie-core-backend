const MODES = new Set(["off", "shadow", "assist"]);
const SEMANTIC_ACTIONS = new Set(["support", "contradict", "request_targeted_reanalysis", "abstain"]);

export const VISIONCORE_EXTERNAL_INTELLIGENCE_POLICY_V1 = Object.freeze({
  version: "1.0.0",
  motto: "Nothing comes and veers into VisionCore's lane.",
  authority: Object.freeze({
    color_measurement: "visioncore",
    spatial_ownership: "visioncore",
    publication: "visioncore",
    scoring: "visioncore",
    recommendation_constraints: "visioncore",
    garment_semantics: "external_advisory_allowed",
    customer_explanation: "external_drafting_allowed_within_visioncore_evidence",
  }),
  provider_limits: Object.freeze({
    normal_calls_per_analysis: 1,
    escalation_calls_per_analysis: 1,
    maximum_external_cost_usd_per_analysis: 0.03,
    timeout_ms: 8000,
    failure_behavior: "fail_open_to_visioncore",
  }),
  prohibited_external_fields: Object.freeze([
    "hex",
    "rgb",
    "lab",
    "delta_e",
    "percentage",
    "pct",
    "score",
    "publication_decision",
    "primary_color",
    "secondary_colors",
    "signature_color",
    "color_mode",
  ]),
});

export function normalizeExternalIntelligenceMode(value, fallback = "off") {
  const normalized = String(value || "").trim().toLowerCase();
  if (MODES.has(normalized)) return normalized;
  return MODES.has(fallback) ? fallback : "off";
}

function clampConfidence(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n > 1 ? n / 100 : n));
}

function cleanText(value, maxLength = 240) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : null;
}

function sanitizeClaim(claim = {}) {
  const action = SEMANTIC_ACTIONS.has(claim?.action) ? claim.action : "abstain";
  return {
    action,
    piece: cleanText(claim?.piece, 80),
    zone: cleanText(claim?.zone, 80),
    pattern: cleanText(claim?.pattern, 80),
    material_cue: cleanText(claim?.material_cue, 120),
    ownership_hypothesis: cleanText(claim?.ownership_hypothesis),
    reason: cleanText(claim?.reason),
    confidence: clampConfidence(claim?.confidence),
  };
}

/**
 * External providers may describe semantics, conflicts, and possible ownership.
 * Numeric color evidence and publication controls are deliberately discarded.
 */
export function sanitizeExternalSemanticObservation(observation = {}) {
  return {
    provider: cleanText(observation?.provider, 80) || "unspecified",
    model: cleanText(observation?.model, 120),
    schema_version: cleanText(observation?.schema_version, 40) || "1",
    claims: (Array.isArray(observation?.claims) ? observation.claims : []).slice(0, 24).map(sanitizeClaim),
    overall_confidence: clampConfidence(observation?.overall_confidence),
  };
}

function hasConfirmedPublication(decision = {}) {
  return decision?.publication_state === "confirmed" || decision?.publication_decision === "publish";
}

function hasMeasuredMulticolorSupport(decision = {}) {
  const colors = Array.isArray(decision?.detected_colors) ? decision.detected_colors : [];
  return colors.length >= 2 && colors.every((color) => color?.hex && color?.ownership_supported === true);
}

/**
 * Produces an advisory handoff only. It never returns replacement color fields,
 * a provider-owned publication decision, or a provider-owned score.
 */
export function evaluateExternalSemanticHandoffV1({
  mode = "off",
  visionCoreDecision = {},
  observation = {},
} = {}) {
  const resolvedMode = normalizeExternalIntelligenceMode(mode);
  const semantic = sanitizeExternalSemanticObservation(observation);
  const activeClaims = semantic.claims.filter((claim) => claim.confidence >= 0.75);
  const contradictions = activeClaims.filter((claim) => claim.action === "contradict");
  const reanalysisRequests = activeClaims.filter((claim) => claim.action === "request_targeted_reanalysis");
  const semanticMulticolorClaim = activeClaims.some((claim) => claim.pattern && !["solid", "single_color"].includes(claim.pattern.toLowerCase()));
  const measuredMulticolorSupport = hasMeasuredMulticolorSupport(visionCoreDecision);

  let disposition = "external_intelligence_disabled";
  let targetedReanalysisRequested = false;

  if (resolvedMode === "shadow") {
    disposition = "record_only_no_publication_change";
  } else if (resolvedMode === "assist") {
    if (hasConfirmedPublication(visionCoreDecision)) {
      disposition = contradictions.length
        ? "visioncore_confirmed_preserve_and_log_conflict"
        : "visioncore_confirmed_external_support_advisory_only";
    } else if (reanalysisRequests.length || contradictions.length) {
      disposition = "targeted_reanalysis_required_before_publication";
      targetedReanalysisRequested = true;
    } else {
      disposition = "semantic_support_only_visioncore_gate_still_required";
    }
  }

  return {
    policy_version: VISIONCORE_EXTERNAL_INTELLIGENCE_POLICY_V1.version,
    mode: resolvedMode,
    authority_owner: "visioncore",
    semantic_observation: semantic,
    disposition,
    targeted_reanalysis_requested: targetedReanalysisRequested,
    publication_changed: false,
    external_override_allowed: false,
    multicolor: {
      semantic_claim_present: semanticMulticolorClaim,
      measured_visioncore_support_present: measuredMulticolorSupport,
      external_claim_can_create_multicolor_publication: false,
      external_claim_can_collapse_multicolor_publication: false,
    },
  };
}

export function validateExternalUsageBudgetV1({ normalCalls = 0, escalationCalls = 0, estimatedCostUsd = 0 } = {}) {
  const limits = VISIONCORE_EXTERNAL_INTELLIGENCE_POLICY_V1.provider_limits;
  const violations = [];
  if (Number(normalCalls) > limits.normal_calls_per_analysis) violations.push("normal_call_limit_exceeded");
  if (Number(escalationCalls) > limits.escalation_calls_per_analysis) violations.push("escalation_call_limit_exceeded");
  if (Number(estimatedCostUsd) > limits.maximum_external_cost_usd_per_analysis) violations.push("external_cost_ceiling_exceeded");
  return { allowed: violations.length === 0, violations, limits };
}
