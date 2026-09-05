const ALLOWED_TYPES = new Set(["watch", "earrings"]);
const EXCLUSION_TYPES = ["skin", "hair", "garment", "background", "other"];

export const OPENAI_ACCESSORY_SPATIAL_GUIDANCE_SCHEMA_V2 = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["schema_version", "target_type", "found", "confidence", "target_bbox", "focus_bbox", "exclusions", "material", "perceived_color_family", "appearance_note", "reason"],
  properties: {
    schema_version: { type: "string", enum: ["2"] },
    target_type: { type: "string", enum: ["watch", "earrings"] },
    found: { type: "boolean" },
    confidence: { type: "number" },
    target_bbox: { anyOf: [{ type: "null" }, { type: "object", additionalProperties: false, required: ["x", "y", "width", "height"], properties: { x: { type: "number" }, y: { type: "number" }, width: { type: "number" }, height: { type: "number" } } }] },
    focus_bbox: { anyOf: [{ type: "null" }, { type: "object", additionalProperties: false, required: ["x", "y", "width", "height"], properties: { x: { type: "number" }, y: { type: "number" }, width: { type: "number" }, height: { type: "number" } } }] },
    exclusions: { type: "array", maxItems: 8, items: { type: "object", additionalProperties: false, required: ["type", "confidence", "bbox"], properties: { type: { type: "string", enum: EXCLUSION_TYPES }, confidence: { type: "number" }, bbox: { type: "object", additionalProperties: false, required: ["x", "y", "width", "height"], properties: { x: { type: "number" }, y: { type: "number" }, width: { type: "number" }, height: { type: "number" } } } } } },
    material: { type: "string", enum: ["metallic", "leather", "fabric", "plastic", "gemstone", "mixed", "unknown"] },
    perceived_color_family: { type: "string" },
    appearance_note: { type: "string" },
    reason: { type: ["string", "null"] },
  },
});

function clamp01(v) { return Math.max(0, Math.min(1, Number(v) || 0)); }
function validBox(box) {
  if (!box) return null;
  const x = clamp01(box.x), y = clamp01(box.y), width = clamp01(box.width), height = clamp01(box.height);
  if (width <= 0 || height <= 0 || x + width > 1 || y + height > 1) return null;
  return { x, y, width, height };
}
function responseText(payload = {}) {
  if (typeof payload?.output_text === "string") return payload.output_text;
  for (const item of payload?.output || []) for (const c of item?.content || []) if (typeof c?.text === "string") return c.text;
  return null;
}

export function buildAccessorySpatialGuidanceRequestV2({ imageUrl, targetType, model = "gpt-5.6-luna" } = {}) {
  if (!imageUrl) throw new Error("imageUrl_required");
  if (!ALLOWED_TYPES.has(targetType)) throw new Error("unsupported_accessory_spatial_guidance_target");
  const objectInstruction = targetType === "watch"
    ? "Target only the watch case/body and visible band. Exclude wrist, hand, skin, tattoos, sleeve, shirt, and background."
    : "Target only the visible earring/stud. Exclude ear, face, skin, hair, and background.";
  const prompt = [
    "You are the semantic isolation layer for VisionCore.",
    `Locate the visible ${targetType} and separate it from surrounding non-object regions.`,
    objectInstruction,
    "Return a tight target_bbox and an even tighter focus_bbox for the accessory itself when possible.",
    "Return exclusion boxes for visible skin, hair, garment, background, or other nearby non-accessory content that overlaps or closely borders the target crop.",
    "Give a broad material hypothesis and a broad perceived color family plus a short appearance note. These are semantic hypotheses only and never numeric color authority.",
    "If metallic, distinguish likely material/body appearance from pale highlights or dark reflections in the appearance note.",
    "Never provide HEX, RGB, LAB, delta-E, percentages, scores, or publication decisions.",
    "If the object cannot be isolated confidently, set found=false and both boxes null.",
  ].join("\n");
  return {
    model,
    store: false,
    reasoning: { effort: "low" },
    input: [{ role: "user", content: [{ type: "input_text", text: prompt }, { type: "input_image", image_url: imageUrl, detail: "high" }] }],
    text: { format: { type: "json_schema", name: "visioncore_accessory_spatial_guidance_v2", strict: true, schema: OPENAI_ACCESSORY_SPATIAL_GUIDANCE_SCHEMA_V2 } },
    max_output_tokens: 700,
  };
}

export async function runOpenAIAccessorySpatialGuidanceV2({
  imageUrl,
  targetType,
  apiKey = process.env.OPENAI_API_KEY,
  model = process.env.OPENAI_SEMANTIC_MODEL || "gpt-5.6-luna",
  timeoutMs = 8000,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (!apiKey) return { ok: true, skipped: true, reason: "openai_api_key_missing" };
  const request = buildAccessorySpatialGuidanceRequestV2({ imageUrl, targetType, model });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(2500, Math.min(10000, Number(timeoutMs) || 8000)));
  const startedAt = Date.now();
  try {
    const response = await fetchImpl("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal: controller.signal,
    });
    if (!response?.ok) throw new Error(`accessory_spatial_guidance_http_${response?.status || "unknown"}`);
    const payload = await response.json();
    const raw = JSON.parse(responseText(payload) || "{}");
    const confidence = clamp01(raw?.confidence);
    const targetBox = raw?.found ? validBox(raw?.target_bbox) : null;
    const focusBox = raw?.found ? validBox(raw?.focus_bbox) : null;
    const exclusions = (Array.isArray(raw?.exclusions) ? raw.exclusions : [])
      .map((row) => ({ type: EXCLUSION_TYPES.includes(row?.type) ? row.type : "other", confidence: clamp01(row?.confidence), bbox: validBox(row?.bbox) }))
      .filter((row) => row.bbox && row.confidence >= 0.6);
    if (!targetBox || confidence < 0.72) {
      return { ok: true, skipped: false, found: false, target_type: targetType, confidence, target_bbox: null, focus_bbox: null, exclusions: [], material: "unknown", perceived_color_family: "unclear", appearance_note: "", reason: "accessory_spatial_guidance_not_confident", latency_ms: Date.now() - startedAt, external_color_authority: false };
    }
    return {
      ok: true,
      skipped: false,
      found: true,
      target_type: targetType,
      confidence,
      target_bbox: targetBox,
      focus_bbox: focusBox || targetBox,
      exclusions,
      material: String(raw?.material || "unknown"),
      perceived_color_family: String(raw?.perceived_color_family || "unclear"),
      appearance_note: String(raw?.appearance_note || ""),
      reason: raw?.reason || null,
      latency_ms: Date.now() - startedAt,
      external_color_authority: false,
      authority_boundary: "semantic_spatial_guidance_only",
    };
  } catch (error) {
    return { ok: false, skipped: false, found: false, target_type: targetType, target_bbox: null, focus_bbox: null, exclusions: [], material: "unknown", perceived_color_family: "unclear", appearance_note: "", reason: error?.name === "AbortError" ? "accessory_spatial_guidance_timeout" : "accessory_spatial_guidance_failure", latency_ms: Date.now() - startedAt, fail_open: true, external_color_authority: false };
  } finally {
    clearTimeout(timer);
  }
}
