import { buildControlledSecondPassPlansV1 } from "./controlledSecondPassV1.js";

function timeoutPromise(ms) {
  return new Promise((_, reject) => {
    const error = new Error("second_pass_timeout");
    error.code = "SECOND_PASS_TIMEOUT";
    setTimeout(() => reject(error), ms);
  });
}

async function boundedCall(fn, payload, timeoutMs) {
  if (typeof fn !== "function") return { ok: false, skipped: true, reason: "executor_missing" };
  const started = Date.now();
  try {
    const result = await Promise.race([Promise.resolve(fn(payload)), timeoutPromise(timeoutMs)]);
    return { ok: true, skipped: false, latency_ms: Date.now() - started, result };
  } catch (error) {
    return {
      ok: false,
      skipped: false,
      latency_ms: Date.now() - started,
      reason: error?.code === "SECOND_PASS_TIMEOUT" ? "timeout" : "execution_failure",
      error: error?.message || "execution_failure",
    };
  }
}

export async function executeRuntimeSecondPassV1({
  syntheses = [],
  attempt = 0,
  imageUrl = null,
  remeasureVisionCore,
  reassessSemantic,
  totalBudgetMs = 12_000,
} = {}) {
  const plans = buildControlledSecondPassPlansV1(syntheses, { attempt });
  const startedAt = Date.now();
  const results = [];

  for (const plan of plans) {
    const elapsed = Date.now() - startedAt;
    const remaining = Math.max(0, totalBudgetMs - elapsed);
    if (remaining < 500) {
      results.push({ plan, ok: false, skipped: true, reason: "latency_budget_exhausted" });
      continue;
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
        imageUrl,
        attempt: attempt + 1,
        preserve_original: true,
      }, Math.min(remaining, 7_000));
      entry.visioncore_remeasurement = call;
      if (call.ok) newMeasurement = call.result || null;
    }

    if (plan.reassess_semantic) {
      const elapsedAfterMeasurement = Date.now() - startedAt;
      const remainingAfterMeasurement = Math.max(0, totalBudgetMs - elapsedAfterMeasurement);
      if (remainingAfterMeasurement >= 500) {
        entry.semantic_reassessment = await boundedCall(reassessSemantic, {
          piece: plan.piece,
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
    results.push(entry);
  }

  return {
    version: "runtime_second_pass_v1",
    attempt,
    max_attempts: 1,
    planned_count: plans.length,
    executed_count: results.filter((value) => !value.skipped).length,
    latency_ms: Date.now() - startedAt,
    latency_budget_ms: totalBudgetMs,
    results,
    publication_changed: false,
    authority_owner: "visioncore",
  };
}
