import {
  evaluateExternalSemanticHandoffV1,
  normalizeExternalIntelligenceMode,
  sanitizeExternalSemanticObservation,
  validateExternalUsageBudgetV1,
} from "../visionCoreExternalIntelligencePolicyV1.js";

export const OPENAI_SEMANTIC_OBSERVER_SCHEMA_V1 = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["schema_version", "overall_confidence", "claims"],
  properties: {
    schema_version: { type: "string", enum: ["1"] },
    overall_confidence: { type: "number", minimum: 0, maximum: 1 },
    claims: {
      type: "array",
      maxItems: 24,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["action", "piece", "zone", "pattern", "material_cue", "ownership_hypothesis", "reason", "confidence"],
        properties: {
          action: { type: "string", enum: ["support", "contradict", "request_targeted_reanalysis", "abstain"] },
          piece: { type: ["string", "null"] },
          zone: { type: ["string", "null"] },
          pattern: { type: ["string", "null"] },
          material_cue: { type: ["string", "null"] },
          ownership_hypothesis: { type: ["string", "null"] },
          reason: { type: ["string", "null"] },
          confidence: { type: "number", minimum: 0, maximum: 1 },
        },
      },
    },
  },
});

function semanticPrompt(visionCoreEvidence = {}) {
  return [
    "You are a semantic observer inside VisionCore, not the final authority.",
    "Identify garment/accessory types, patterns, material cues, and possible ownership conflicts.",
    "Do not calculate or override hex, RGB, LAB, percentages, outfit scores, or publication decisions.",
    "If evidence is ambiguous, abstain or request targeted reanalysis.",
    `VisionCore evidence: ${JSON.stringify(visionCoreEvidence)}`,
  ].join("\n");
}

export function buildOpenAISemanticRequestV1({ imageUrl, visionCoreEvidence = {}, model = "gpt-5.6-luna" } = {}) {
  if (!imageUrl) throw new Error("VisionCore semantic observer requires imageUrl");
  return {
    model,
    store: false,
    reasoning: { effort: "low" },
    input: [{
      role: "user",
      content: [
        { type: "input_text", text: semanticPrompt(visionCoreEvidence) },
        { type: "input_image", image_url: imageUrl, detail: "high" },
      ],
    }],
    text: {
      format: {
        type: "json_schema",
        name: "visioncore_semantic_observation_v1",
        strict: true,
        schema: OPENAI_SEMANTIC_OBSERVER_SCHEMA_V1,
      },
    },
    max_output_tokens: 1200,
  };
}

function responseText(payload = {}) {
  if (typeof payload?.output_text === "string") return payload.output_text;
  for (const item of payload?.output || []) {
    for (const content of item?.content || []) {
      if (typeof content?.text === "string") return content.text;
    }
  }
  return null;
}

function estimateModelCost(model, usage = {}) {
  const input = Number(usage?.input_tokens || 0);
  const output = Number(usage?.output_tokens || 0);
  const rates = String(model || "").includes("terra") ? { input: 2, output: 12 } : { input: 0.20, output: 1.20 };
  return input * rates.input / 1_000_000 + output * rates.output / 1_000_000;
}

export async function runOpenAISemanticObserverV1({
  mode = "off",
  apiKey = process.env.OPENAI_API_KEY,
  imageUrl,
  visionCoreEvidence = {},
  visionCoreDecision = {},
  model = process.env.OPENAI_SEMANTIC_MODEL || "gpt-5.6-luna",
  fetchImpl = globalThis.fetch,
  cache = null,
  cacheKey = null,
} = {}) {
  const resolvedMode = normalizeExternalIntelligenceMode(mode);
  if (resolvedMode === "off") return { ok: true, skipped: true, reason: "external_intelligence_off", handoff: evaluateExternalSemanticHandoffV1({ mode: "off", visionCoreDecision }) };
  if (!apiKey) return { ok: true, skipped: true, reason: "openai_api_key_missing", handoff: evaluateExternalSemanticHandoffV1({ mode: "off", visionCoreDecision }) };
  if (cacheKey && cache?.has(cacheKey)) return { ...cache.get(cacheKey), cached: true };
  if (typeof fetchImpl !== "function") throw new Error("VisionCore semantic observer requires fetch");

  const request = buildOpenAISemanticRequestV1({ imageUrl, visionCoreEvidence, model });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  const startedAt = Date.now();
  try {
    const response = await fetchImpl("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal: controller.signal,
    });
    if (!response?.ok) throw new Error(`OpenAI semantic observer failed with status ${response?.status || "unknown"}`);
    const payload = await response.json();
    const raw = JSON.parse(responseText(payload) || "{}");
    const observation = sanitizeExternalSemanticObservation({ provider: "openai", model, ...raw });
    const estimatedCostUsd = estimateModelCost(model, payload?.usage);
    const budget = validateExternalUsageBudgetV1({ normalCalls: 1, escalationCalls: 0, estimatedCostUsd });
    if (!budget.allowed) throw new Error(`External intelligence budget rejected: ${budget.violations.join(",")}`);
    const result = {
      ok: true,
      skipped: false,
      cached: false,
      latency_ms: Date.now() - startedAt,
      estimated_cost_usd: estimatedCostUsd,
      usage: payload?.usage || null,
      handoff: evaluateExternalSemanticHandoffV1({ mode: resolvedMode, visionCoreDecision, observation }),
    };
    if (cacheKey && cache?.set) cache.set(cacheKey, result);
    return result;
  } catch (error) {
    return {
      ok: false,
      skipped: false,
      reason: error?.name === "AbortError" ? "external_timeout" : "external_provider_failure",
      error: error?.message || "external_provider_failure",
      latency_ms: Date.now() - startedAt,
      fail_open: true,
      handoff: evaluateExternalSemanticHandoffV1({ mode: "off", visionCoreDecision }),
    };
  } finally {
    clearTimeout(timeout);
  }
}
