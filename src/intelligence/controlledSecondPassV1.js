function clamp01(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n > 1 ? n / 100 : n));
}

function canonicalPiece(value) {
  const piece = String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");
  if (/(^|_)(footwear|shoe|shoes|sneaker|sneakers)($|_)/.test(piece)) return "footwear";
  if (/(^|_)(outerwear|jacket|coat|windbreaker)($|_)/.test(piece)) return "outerwear";
  if (/(^|_)(lower_garment|shorts|trousers|pants)($|_)/.test(piece)) return "lower_garment";
  if (/(^|_)(upper_garment|shirt|undershirt)($|_)/.test(piece) || /(^|_)top$/.test(piece)) return "upper_garment";
  return piece;
}

function planPriority(plan = {}) {
  const zonePriority = {
    outerwear: 80,
    upper_garment: 75,
    lower_garment: 70,
    footwear: 65,
    headwear: 45,
    eyewear: 40,
    watch: 30,
    necklace: 25,
    bracelet: 20,
    ring: 15,
  }[canonicalPiece(plan.piece)] || 10;
  return (plan.force_fresh_segmentation ? 400 : 0)
    + (plan.remeasure_visioncore ? 200 : 0)
    + (plan.reassess_semantic ? 50 : 0)
    + zonePriority;
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
  const instanceKey = synthesis?.instance_key || null;

  const base = {
    version: "controlled_second_pass_v1",
    piece,
    instance_key: instanceKey,
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
    force_fresh_segmentation: synthesis?.integrity_v1?.force_fresh_segmentation === true,
    integrity_reasons: synthesis?.integrity_v1?.reasons || [],
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
      force_fresh_segmentation: weakMeasurement || base.force_fresh_segmentation,
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
      force_fresh_segmentation: weakMeasurement || base.force_fresh_segmentation,
    };
  }

  return { ...base, reason: "insufficient_context_for_second_pass" };
}

export function buildControlledSecondPassPlansV1(syntheses = [], { attempt = 0 } = {}) {
  const plans = (Array.isArray(syntheses) ? syntheses : [])
    .map((synthesis) => buildControlledSecondPassPlanV1({ synthesis, attempt }))
    .filter((plan) => plan.allowed);
  const unique = new Map();
  for (const plan of plans) {
    const key = `${canonicalPiece(plan.piece)}:${String(plan.instance_key || "").trim().toLowerCase()}`;
    const prioritized = { ...plan, scheduling_priority: planPriority(plan) };
    const existing = unique.get(key);
    if (!existing || prioritized.scheduling_priority > existing.scheduling_priority) unique.set(key, prioritized);
  }
  return [...unique.values()].sort((left, right) => right.scheduling_priority - left.scheduling_priority);
}
