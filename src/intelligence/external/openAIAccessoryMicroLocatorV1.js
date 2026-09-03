const ALLOWED_TYPES = new Set(["watch", "earrings"]);

export const OPENAI_ACCESSORY_MICRO_LOCATOR_SCHEMA_V1 = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["schema_version", "target_type", "found", "confidence", "bbox", "reason"],
  properties: {
    schema_version: { type: "string", enum: ["1"] },
    target_type: { type: "string", enum: ["watch", "earrings"] },
    found: { type: "boolean" },
    confidence: { type: "number" },
    bbox: {
      anyOf: [
        { type: "null" },
        {
          type: "object",
          additionalProperties: false,
          required: ["x", "y", "width", "height"],
          properties: {
            x: { type: "number" }, y: { type: "number" },
            width: { type: "number" }, height: { type: "number" },
          },
        },
      ],
    },
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

export function buildAccessoryMicroLocatorRequestV1({ imageUrl, targetType, model = "gpt-5.6-luna" } = {}) {
  if (!imageUrl) throw new Error("imageUrl_required");
  if (!ALLOWED_TYPES.has(targetType)) throw new Error("unsupported_micro_locator_target");
  const prompt = [
    "You are a spatial localization assistant for VisionCore.",
    `Locate only the visible ${targetType} itself, not the surrounding body region.`,
    targetType === "watch" ? "Box the watch case/body and visible band only. Exclude wrist, hand, skin, tattoos, shirt, and background as much as possible." : "Box the visible earring/stud itself. Exclude ear, face, hair, skin, and background as much as possible.",
    "Return a tight normalized bounding box where x,y,width,height are fractions from 0 to 1 relative to the full image.",
    "Do not provide or infer HEX, RGB, LAB, color names, scores, or publication decisions.",
    "If the object cannot be isolated confidently, set found=false and bbox=null.",
  ].join("\n");
  return {
    model, store: false, reasoning: { effort: "low" },
    input: [{ role: "user", content: [{ type: "input_text", text: prompt }, { type: "input_image", image_url: imageUrl, detail: "high" }] }],
    text: { format: { type: "json_schema", name: "visioncore_accessory_micro_locator_v1", strict: true, schema: OPENAI_ACCESSORY_MICRO_LOCATOR_SCHEMA_V1 } },
    max_output_tokens: 350,
  };
}

export async function runOpenAIAccessoryMicroLocatorV1({
  imageUrl, targetType, apiKey = process.env.OPENAI_API_KEY,
  model = process.env.OPENAI_SEMANTIC_MODEL || "gpt-5.6-luna",
  timeoutMs = 7000, fetchImpl = globalThis.fetch,
} = {}) {
  if (!apiKey) return { ok: true, skipped: true, reason: "openai_api_key_missing" };
  const request = buildAccessoryMicroLocatorRequestV1({ imageUrl, targetType, model });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(2500, Math.min(10000, Number(timeoutMs) || 7000)));
  const startedAt = Date.now();
  try {
    const response = await fetchImpl("https://api.openai.com/v1/responses", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify(request), signal: controller.signal });
    if (!response?.ok) throw new Error(`micro_locator_http_${response?.status || "unknown"}`);
    const payload = await response.json();
    const raw = JSON.parse(responseText(payload) || "{}");
    const bbox = raw?.found ? validBox(raw?.bbox) : null;
    const confidence = clamp01(raw?.confidence);
    if (!bbox || confidence < 0.72) return { ok: true, skipped: false, found: false, target_type: targetType, confidence, bbox: null, reason: "micro_localization_not_confident", latency_ms: Date.now() - startedAt };
    return { ok: true, skipped: false, found: true, target_type: targetType, confidence, bbox, reason: raw?.reason || null, latency_ms: Date.now() - startedAt, external_color_authority: false };
  } catch (error) {
    return { ok: false, skipped: false, found: false, target_type: targetType, bbox: null, reason: error?.name === "AbortError" ? "micro_locator_timeout" : "micro_locator_failure", latency_ms: Date.now() - startedAt, fail_open: true };
  } finally { clearTimeout(timer); }
}
