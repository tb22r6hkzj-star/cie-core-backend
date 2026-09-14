import { buildControlledSecondPassPlansV1 } from "./controlledSecondPassV1.js";

function timeoutPromise(ms) {
  let timer = null;
  const promise = new Promise((_, reject) => {
    const error = new Error("second_pass_timeout");
    error.code = "SECOND_PASS_TIMEOUT";
    timer = setTimeout(() => reject(error), ms);
  });
  return { promise, cancel: () => clearTimeout(timer) };
}

async function boundedCall(fn, payload, timeoutMs) {
  if (typeof fn !== "function") return { ok: false, skipped: true, reason: "executor_missing" };
  const started = Date.now();
  const timeout = timeoutPromise(timeoutMs);
  try {
    const result = await Promise.race([Promise.resolve(fn(payload)), timeout.promise]);
    return { ok: true, skipped: false, latency_ms: Date.now() - started, result };
  } catch (error) {
    return {
      ok: false,
      skipped: false,
      latency_ms: Date.now() - started,
      reason: error?.code === "SECOND_PASS_TIMEOUT" ? "timeout" : "execution_failure",
      error: error?.message || "execution_failure",
    };
  } finally {
    timeout.cancel();
  }
}

export async function executeRuntimeSecondPassV1({
  syntheses = [],
  attempt = 0,
  imageUrl = null,
  remeasureVisionCore,
  reassessSemantic,
  totalBudgetMs = 12_000,
  maxConcurrency = 4,
} = {}) {
  const plans = buildControlledSecondPassPlansV1(syntheses, { attempt });
  const startedAt = Date.now();
  const results = new Array(plans.length);
  const concurrency = Math.max(1, Math.min(4, Number(maxConcurrency) || 1, plans.length || 1));
  let nextPlanIndex = 0;

  const executePlan = async (plan) => {
    const elapsed = Date.now() - startedAt;
    const remaining = Math.max(0, totalBudgetMs - elapsed);
    if (remaining < 500) {
      return { plan, ok: false, skipped: true, reason: "latency_budget_exhausted" };
    }

    const entry = {
      plan,
      visioncore_remeasurement: null,
      semantic_reassessment: null,
      publication_changed: false,
      measured_hex_changed_by_executor: false,
    };

    let newMeasurement = null;
    if (plan.remeasure_visioncore) {
      const call = await boundedCall(remeasureVisionCore, {
          piece: plan.piece,
          instance_key: plan.instance_key,
        force_fresh_segmentation: plan.force_fresh_segmentation === true,
        integrity_reasons: plan.integrity_reasons || [],
        imageUrl,
        attempt: attempt + 1,
        preserve_original: true,
      }, Math.min(remaining, 14_500));
      if (call.ok && call.result?.available === false) {
        call.ok = false;
        call.reason = "measurement_unavailable";
      }
      entry.visioncore_remeasurement = call;
      if (call.ok) newMeasurement = call.result || null;
    }

    if (plan.reassess_semantic) {
      const elapsedAfterMeasurement = Date.now() - startedAt;
      const remainingAfterMeasurement = Math.max(0, totalBudgetMs - elapsedAfterMeasurement);
      if (remainingAfterMeasurement >= 500) {
        entry.semantic_reassessment = await boundedCall(reassessSemantic, {
        piece: plan.piece,
        instance_key: plan.instance_key,
          imageUrl,
          attempt: attempt + 1,
          measurement_context: newMeasurement,
          preserve_visioncore_authority: true,
          forbid_numeric_color_override: true,
        }, Math.min(remainingAfterMeasurement, 7_000));
      } else {
        entry.semantic_reassessment = { ok: false, skipped: true, reason: "latency_budget_exhausted" };
      }
    }

    entry.ok = [entry.visioncore_remeasurement, entry.semantic_reassessment]
      .filter(Boolean)
      .every((value) => value.ok || value.skipped);
    return entry;
  };

  const worker = async () => {
    while (nextPlanIndex < plans.length) {
      const index = nextPlanIndex;
      nextPlanIndex += 1;
      results[index] = await executePlan(plans[index]);
    }
  };
  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  const required = plans.length > 0;
  const completed = required && results.length === plans.length && results.every((entry) => {
    if (entry?.skipped || entry?.ok === false) return false;
    if (entry?.plan?.remeasure_visioncore && entry?.visioncore_remeasurement?.ok !== true) return false;
    if (entry?.plan?.reassess_semantic && entry?.semantic_reassessment?.ok !== true) return false;
    return true;
  });
  return {
    version: "runtime_second_pass_v1",
    attempt,
    max_attempts: 1,
    planned_count: plans.length,
    executed_count: results.filter((value) => !value.skipped).length,
    latency_ms: Date.now() - startedAt,
    latency_budget_ms: totalBudgetMs,
    max_concurrency: concurrency,
    results,
    publication_changed: false,
    authority_owner: "visioncore",
    required,
    completed,
    reason: required ? (completed ? "correction_completed" : "correction_required_unresolved") : "not_required",
  };
}
