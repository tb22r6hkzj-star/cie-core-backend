function clamp01(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n > 1 ? n / 100 : n));
}

/**
 * Builds a bounded second-pass plan from the higher-reasoning synthesis state.
 * This module plans the retry; it does not mutate color, masks, or publication.
 */
export function buildControlledSecondPassPlanV1({ synthesis = {}, attempt = 0 } = {}) {
  const state = synthesis?.reasoning_state || "insufficient_context";
  const measurementConfidence = clamp01(synthesis?.measurement_truth?.confidence);
  const semanticConfidence = clamp01(synthesis?.appearance_truth?.confidence);
  const piece = synthesis?.piece || null;

  const base = {
    version: "controlled_second_pass_v1",
    piece,
    attempt,
    max_attempts: 1,
    allowed: false,
    action: "none",
    reason: null,
    remeasure_visioncore: false,
    reassess_semantic: false,
    preserve_current_measurement: true,
    publication_changed: false,
    measured_hex_changed: false,
  };

  if (attempt >= 1) {
    return { ...base, reason: "second_pass_limit_reached" };
  }

  if (state === "convergent_truth") {
    return { ...base, reason: "independent_truths_already_converge" };
  }

  if (state === "measurement_dominant") {
    return {
      ...base,
      allowed: semanticConfidence >= 0.75,
      action: semanticConfidence >= 0.75 ? "semantic_reassessment" : "none",
      reason: semanticConfidence >= 0.75 ? "strong_measurement_challenges_semantic" : "semantic_signal_too_weak",
      reassess_semantic: semanticConfidence >= 0.75,
    };
  }

  if (state === "explainable_divergence") {
    return {
      ...base,
      allowed: true,
      action: "semantic_reassessment_with_measurement_context",
      reason: "preserve_measurement_explain_appearance",
      reassess_semantic: true,
      preserve_current_measurement: true,
    };
  }

  if (state === "appearance_alert") {
    const weakMeasurement = measurementConfidence < 0.8;
    return {
      ...base,
      allowed: weakMeasurement,
      action: weakMeasurement ? "targeted_visioncore_remeasurement" : "semantic_reassessment",
      reason: weakMeasurement ? "semantic_signal_challenges_weak_measurement" : "measurement_is_already_strong",
      remeasure_visioncore: weakMeasurement,
      reassess_semantic: !weakMeasurement,
      preserve_current_measurement: !weakMeasurement,
    };
  }

  if (state === "unresolved_conflict") {
    const weakMeasurement = measurementConfidence < 0.8;
    return {
      ...base,
      allowed: true,
      action: weakMeasurement ? "remeasure_then_semantic_reassessment" : "semantic_reassessment_with_measurement_context",
      reason: weakMeasurement ? "conflict_requires_new_measurement_evidence" : "strong_measurement_requires_semantic_recheck",
      remeasure_visioncore: weakMeasurement,
      reassess_semantic: true,
      preserve_current_measurement: !weakMeasurement,
    };
  }

  return { ...base, reason: "insufficient_context_for_second_pass" };
}

export function buildControlledSecondPassPlansV1(syntheses = [], { attempt = 0 } = {}) {
  return (Array.isArray(syntheses) ? syntheses : [])
    .map((synthesis) => buildControlledSecondPassPlanV1({ synthesis, attempt }))
    .filter((plan) => plan.allowed);
}
