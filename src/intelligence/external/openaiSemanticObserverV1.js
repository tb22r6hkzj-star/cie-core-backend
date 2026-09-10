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
    schema_version: { type: "string", enum: ["2"] },
    overall_confidence: { type: "number" },
    claims: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["action", "piece", "subtype", "instance_key", "visible_count", "component_of", "zone", "pattern", "perceived_color_family", "color_appearance_cue", "lighting_cue", "color_confidence", "material_cue", "ownership_hypothesis", "layer_role", "overlaps_instance_keys", "occlusion", "unusual_detail", "segmentation_prompt", "reason", "confidence"],
        properties: {
          action: { type: "string", enum: ["support", "contradict", "request_targeted_reanalysis", "abstain"] },
          piece: { type: ["string", "null"] },
          subtype: { type: ["string", "null"] },
          instance_key: { type: ["string", "null"] },
          visible_count: { type: ["integer", "null"] },
          component_of: { type: ["string", "null"] },
          zone: { type: ["string", "null"] },
          pattern: { type: ["string", "null"] },
          perceived_color_family: {
            type: ["string", "null"],
            enum: ["black", "white", "gray", "brown", "beige", "red", "orange", "yellow", "green", "blue", "purple", "pink", "metallic_gold", "metallic_silver", "multicolor", "unclear", null],
          },
          color_appearance_cue: { type: ["string", "null"] },
          lighting_cue: { type: ["string", "null"] },
          color_confidence: { type: "number" },
          material_cue: { type: ["string", "null"] },
          ownership_hypothesis: { type: ["string", "null"] },
          layer_role: { type: "string", enum: ["inner", "middle", "outer", "standalone", "accessory", "unknown"] },
          overlaps_instance_keys: { type: "array", items: { type: "string" } },
          occlusion: { type: "string", enum: ["none", "partial", "heavy", "unknown"] },
          unusual_detail: { type: ["string", "null"] },
          segmentation_prompt: { type: ["string", "null"] },
          reason: { type: ["string", "null"] },
          confidence: { type: "number" },
        },
      },
    },
  },
});

export const OPENAI_SEGMENTATION_SCENE_SCHEMA_V1 = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["schema_version", "overall_confidence", "claims"],
  properties: {
    schema_version: { type: "string", enum: ["1"] },
    overall_confidence: { type: "number" },
    claims: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["action", "piece", "subtype", "instance_key", "visible_count", "component_of", "zone", "pattern", "material_cue", "layer_role", "overlaps_instance_keys", "occlusion", "unusual_detail", "segmentation_prompt", "reason", "confidence"],
        properties: {
          action: { type: "string", enum: ["support", "contradict", "request_targeted_reanalysis", "abstain"] },
          piece: { type: ["string", "null"] },
          subtype: { type: ["string", "null"] },
          instance_key: { type: ["string", "null"] },
          visible_count: { type: ["integer", "null"] },
          component_of: { type: ["string", "null"] },
          zone: { type: ["string", "null"] },
          pattern: { type: ["string", "null"] },
          material_cue: { type: ["string", "null"] },
          layer_role: { type: "string", enum: ["inner", "middle", "outer", "standalone", "accessory", "unknown"] },
          overlaps_instance_keys: { type: "array", items: { type: "string" } },
          occlusion: { type: "string", enum: ["none", "partial", "heavy", "unknown"] },
          unusual_detail: { type: ["string", "null"] },
          segmentation_prompt: { type: ["string", "null"] },
          reason: { type: ["string", "null"] },
          confidence: { type: "number" },
        },
      },
    },
  },
});

function semanticPrompt(visionCoreEvidence = {}) {
  return [
    "You are a semantic observer inside VisionCore, not the final authority.",
    "Create a comprehensive inventory with one claim for every clearly visible garment and every distinct accessory instance.",
    "Do not collapse layered chains, a pendant, earrings, a watch, bracelets, rings, belt hardware, or shoe hardware into one generic jewelry claim. Give each visibly separate item its own stable instance_key and visible_count.",
    "Use precise subtypes when visible, such as horsebit loafer, penny loafer, sneaker, chain necklace, cross pendant, stud earring, bracelet, watch, or horsebit shoe hardware.",
    "Use action=support when you independently observe an item, even when VisionCore did not list it. Use contradict only when VisionCore appears to list an item that is not visibly present.",
    "Identify garment/accessory types, body zones, patterns, material cues, perceived color families, lighting cues, and possible ownership conflicts.",
    "Model the outfit as a scene graph: state each piece's layer_role, which instance keys it overlaps, its occlusion, and any tiny or unusual fashion detail.",
    "Provide a short segmentation_prompt that uniquely describes the visible physical item without mentioning its color.",
    "Do not identify the person or infer protected, demographic, medical, religious, or socioeconomic traits.",
    "For each visible piece, independently suggest only one broad perceived_color_family from the schema and a short color_appearance_cue. Use unclear when lighting, reflection, transparency, or occlusion makes the family unreliable.",
    "Do not use VisionCore's color conclusion to form the suggestion. VisionCore will independently measure object-local pixels and reconcile your categorical hypothesis afterward.",
    "Never calculate, invent, request, or override hex, RGB, LAB, delta-E, percentages, outfit scores, or publication decisions.",
    "If evidence is ambiguous, abstain or request targeted reanalysis.",
    `VisionCore evidence: ${JSON.stringify(visionCoreEvidence)}`,
  ].join("\n");
}

function segmentationScenePrompt(visionCoreEvidence = {}) {
  return [
    "You are VisionCore's semantic scene-understanding stage.",
    "Inventory every clearly visible garment and each distinct fashion accessory as a separate stable instance.",
    "Recognize unfamiliar garment types, layered or overlapping pieces, partial occlusion, and tiny or unusual fashion details.",
    "Keep pendants, chains, earrings, watches, bracelets, rings, belts, bags, shoe hardware, and each visible garment separate.",
    "Record component_of relationships, layer_role, overlaps_instance_keys, occlusion, pattern, and material cues.",
    "Provide a short segmentation_prompt that identifies only the physical item and contains no color name.",
    "Do not identify the person or infer protected, demographic, medical, religious, or socioeconomic traits.",
    "Do not calculate or provide any hex, RGB, LAB, percentage, score, or publication decision. VisionCore measures pixels after masking.",
    `VisionCore evidence: ${JSON.stringify(visionCoreEvidence)}`,
  ].join("\n");
}

export function buildOpenAISemanticRequestV1({ imageUrl, visionCoreEvidence = {}, model = "gpt-5.6-luna", profile = "full" } = {}) {
  if (!imageUrl) throw new Error("VisionCore semantic observer requires imageUrl");
  const sceneGraphProfile = profile === "segmentation_scene";
  return {
    model,
    store: false,
    reasoning: { effort: "low" },
    input: [{
      role: "user",
      content: [
        { type: "input_text", text: sceneGraphProfile ? segmentationScenePrompt(visionCoreEvidence) : semanticPrompt(visionCoreEvidence) },
        { type: "input_image", image_url: imageUrl, detail: "high" },
      ],
    }],
    text: {
      format: {
        type: "json_schema",
        name: sceneGraphProfile ? "visioncore_segmentation_scene_v1" : "visioncore_semantic_observation_v2",
        strict: true,
        schema: sceneGraphProfile ? OPENAI_SEGMENTATION_SCENE_SCHEMA_V1 : OPENAI_SEMANTIC_OBSERVER_SCHEMA_V1,
      },
    },
    // A complete garment, layered scene graph, and multi-accessory inventory
    // can be large because strict JSON must emit every required field.
    max_output_tokens: sceneGraphProfile ? 3600 : 6000,
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

function semanticTimeoutMs(value = process.env.OPENAI_SEMANTIC_TIMEOUT_MS) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 30_000;
  return Math.min(60_000, Math.max(5_000, Math.round(parsed)));
}

export async function runOpenAISemanticObserverV1({
  mode = "off",
  apiKey = process.env.OPENAI_API_KEY,
  imageUrl,
  visionCoreEvidence = {},
  visionCoreDecision = {},
  model = process.env.OPENAI_SEMANTIC_MODEL || "gpt-5.6-luna",
  timeoutMs = process.env.OPENAI_SEMANTIC_TIMEOUT_MS,
  fetchImpl = globalThis.fetch,
  cache = null,
  cacheKey = null,
  profile = "full",
} = {}) {
  const resolvedMode = normalizeExternalIntelligenceMode(mode);
  if (resolvedMode === "off") return { ok: true, skipped: true, reason: "external_intelligence_off", handoff: evaluateExternalSemanticHandoffV1({ mode: "off", visionCoreDecision }) };
  if (!apiKey) return { ok: true, skipped: true, reason: "openai_api_key_missing", handoff: evaluateExternalSemanticHandoffV1({ mode: "off", visionCoreDecision }) };
  if (cacheKey && cache?.has(cacheKey)) return { ...cache.get(cacheKey), cached: true };
  if (typeof fetchImpl !== "function") throw new Error("VisionCore semantic observer requires fetch");

  const request = buildOpenAISemanticRequestV1({ imageUrl, visionCoreEvidence, model, profile });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), semanticTimeoutMs(timeoutMs));
  const startedAt = Date.now();
  let failureStage = "request";
  try {
    const response = await fetchImpl("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal: controller.signal,
    });
    failureStage = "provider_response";
    if (!response?.ok) {
      let providerError = null;
      try {
        providerError = await response.json();
      } catch {
        providerError = null;
      }
      const error = new Error(`OpenAI semantic observer failed with status ${response?.status || "unknown"}`);
      error.providerStatus = Number(response?.status) || null;
      error.providerErrorCode = String(providerError?.error?.code || "").slice(0, 80) || null;
      error.providerErrorType = String(providerError?.error?.type || "").slice(0, 80) || null;
      throw error;
    }
    const payload = await response.json();
    failureStage = "response_parse";
    let raw;
    try {
      raw = JSON.parse(responseText(payload) || "{}");
    } catch (error) {
      error.providerErrorCode = String(
        payload?.incomplete_details?.reason || (payload?.status === "incomplete" ? "response_incomplete" : "invalid_structured_output")
      ).slice(0, 80);
      error.providerErrorType = "response_parse_error";
      throw error;
    }
    failureStage = "observation_sanitize";
    const observation = sanitizeExternalSemanticObservation({ provider: "openai", model, ...raw });
    const estimatedCostUsd = estimateModelCost(model, payload?.usage);
    const budget = validateExternalUsageBudgetV1({ normalCalls: 1, escalationCalls: 0, estimatedCostUsd });
    failureStage = "budget_validation";
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
      provider_status: error?.providerStatus || null,
      provider_error_code: error?.providerErrorCode || null,
      provider_error_type: error?.providerErrorType || null,
      provider_error_name: String(error?.name || "Error").slice(0, 80),
      failure_stage: failureStage,
      latency_ms: Date.now() - startedAt,
      fail_open: true,
      handoff: evaluateExternalSemanticHandoffV1({ mode: "off", visionCoreDecision }),
    };
  } finally {
    clearTimeout(timeout);
  }
}
