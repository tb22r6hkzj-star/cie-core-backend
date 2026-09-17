function clean(value) {
  return String(value || "").trim();
}

export function segmentationPlanBindingEnabledV1(env = process.env) {
  return !["0", "false", "off", "disabled"].includes(clean(env?.VISIONCORE_SEGMENTATION_PLAN_BINDING_V1).toLowerCase());
}

function targetMap(plan = {}) {
  return new Map((Array.isArray(plan?.targets) ? plan.targets : [])
    .map((target) => [clean(target?.id), target])
    .filter(([id]) => id));
}

function targetMatchKey(target = {}) {
  const detectorRegionId = clean(target?.detector_region_id);
  const zone = clean(target?.zone);
  return detectorRegionId && zone ? `${zone}:${detectorRegionId}` : null;
}

function applyTargetIdentity(region = {}, target = {}) {
  return {
    ...region,
    id: target.id,
    zone: target.zone,
    label: target.label || region.label,
    segment_label: target.label || region.segment_label,
    target_conditioned_mask_v1: {
      ...(region?.target_conditioned_mask_v1 || {}),
      prompt: target.prompt,
      detector_region_id: target.detector_region_id,
      semantic_instance_key: target.semantic_instance_key,
      layer_role: target.layer_role,
      rebound_from_target_id: region?.id || null,
      plan_binding: "final_semantic_target_by_detector_region",
    },
  };
}

function supplementEligible(target = {}) {
  if (target?.bbox) return true;
  return target?.source === "semantic_target" &&
    Boolean(target?.semantic_instance_key) &&
    Number(target?.confidence || 0) >= 0.8;
}

/**
 * Early detector masks are generated before the semantic observer finishes.
 * Bind each result to the final semantic instance only when both plans point to
 * the same detector region. Unmatched early masks retain their originating
 * target so validation can never silently turn them into target=null.
 */
export function bindEarlySegmentationToFinalPlanV1({ earlySegmentation = {}, finalPlan = {} } = {}) {
  const originPlan = earlySegmentation?.plan || { targets: [] };
  const originById = targetMap(originPlan);
  const finalTargets = Array.isArray(finalPlan?.targets) ? finalPlan.targets : [];
  const finalByMatchKey = new Map();
  for (const target of finalTargets) {
    const key = targetMatchKey(target);
    if (key && !finalByMatchKey.has(key)) finalByMatchKey.set(key, target);
  }

  const reboundByOriginId = new Map();
  const coveredFinalIds = new Set();
  for (const originTarget of originById.values()) {
    const match = finalByMatchKey.get(targetMatchKey(originTarget)) || null;
    if (!match || coveredFinalIds.has(clean(match.id))) continue;
    reboundByOriginId.set(clean(originTarget.id), match);
    coveredFinalIds.add(clean(match.id));
  }

  const regions = (Array.isArray(earlySegmentation?.regions) ? earlySegmentation.regions : [])
    .map((region) => {
      const match = reboundByOriginId.get(clean(region?.id));
      return match ? applyTargetIdentity(region, match) : region;
    });
  const results = (Array.isArray(earlySegmentation?.results) ? earlySegmentation.results : [])
    .map((result) => {
      const originId = clean(result?.target?.id);
      const match = reboundByOriginId.get(originId);
      return match ? { ...result, target: match, rebound_from_target_id: originId } : result;
    });

  const unmatchedOriginTargets = [...originById.values()]
    .filter((target) => !reboundByOriginId.has(clean(target.id)))
    .filter((target) => !finalTargets.some((finalTarget) => clean(finalTarget.id) === clean(target.id)));
  const validationPlan = {
    ...finalPlan,
    targets: [...finalTargets, ...unmatchedOriginTargets],
    binding_version: "target_conditioned_segmentation_binding_v1",
  };
  const missingTargets = finalTargets
    .filter((target) => !coveredFinalIds.has(clean(target.id)))
    .filter(supplementEligible);
  const missingPlan = {
    ...finalPlan,
    targets: missingTargets,
    candidate_target_count: missingTargets.length,
    omitted_target_count: 0,
    supplemental_for_early_segmentation: true,
  };

  return {
    segmentation: { ...earlySegmentation, regions, results, plan: validationPlan },
    validation_plan: validationPlan,
    missing_plan: missingPlan,
    rebound_count: reboundByOriginId.size,
    unmatched_early_target_count: unmatchedOriginTargets.length,
  };
}

export function mergeTargetConditionedSegmentationsV1({ base = {}, supplement = null, validationPlan = {} } = {}) {
  if (!supplement?.ok) return { ...base, plan: validationPlan };
  const providers = [...new Set([
    ...(Array.isArray(base?.providers) ? base.providers : [base?.provider]),
    ...(Array.isArray(supplement?.providers) ? supplement.providers : [supplement?.provider]),
  ].filter(Boolean))];
  return {
    ...base,
    ok: Boolean((base?.regions || []).length || (supplement?.regions || []).length),
    reason: null,
    provider: providers.length === 1 ? providers[0] : providers.length ? "mixed" : null,
    providers,
    regions: [...(base?.regions || []), ...(supplement?.regions || [])],
    results: [...(base?.results || []), ...(supplement?.results || [])],
    plan: validationPlan,
    supplemental_segmentation_v1: {
      applied: true,
      target_count: supplement?.plan?.targets?.length || 0,
      providers: Array.isArray(supplement?.providers) ? supplement.providers : [supplement?.provider].filter(Boolean),
    },
  };
}
