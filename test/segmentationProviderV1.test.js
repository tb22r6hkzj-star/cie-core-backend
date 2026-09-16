import test from "node:test";
import assert from "node:assert/strict";
import {
  falBoxPromptV1,
  runFalAutoSegmentationV1,
  runFalQueueV1,
  runFalTargetMaskV1,
  segmentationProviderConfigV1,
  segmentationProviderOrderV1,
} from "../src/intelligence/external/segmentationProviderV1.js";

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function successfulQueueFetch(result, calls = []) {
  return async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (options.method === "POST") {
      return jsonResponse({
        request_id: "req_123",
        status_url: "https://queue.fal.run/fal-ai/sam-3-1/image/requests/req_123/status",
        response_url: "https://queue.fal.run/fal-ai/sam-3-1/image/requests/req_123/response",
        cancel_url: "https://queue.fal.run/fal-ai/sam-3-1/image/requests/req_123/cancel",
      });
    }
    if (String(url).endsWith("/status")) return jsonResponse({ status: "COMPLETED" });
    return jsonResponse(result);
  };
}

test("auto provider selection promotes fal when configured and retains Replicate fallback", () => {
  const env = { FAL_KEY: "fal-secret", REPLICATE_API_TOKEN: "replicate-secret" };
  assert.deepEqual(segmentationProviderOrderV1(env), ["fal", "replicate"]);
  assert.deepEqual(segmentationProviderOrderV1({ REPLICATE_API_TOKEN: "replicate-secret" }), ["replicate"]);
  assert.deepEqual(segmentationProviderOrderV1({}), []);
});

test("explicit provider and fallback policy are system-wide configuration", () => {
  const config = segmentationProviderConfigV1({
    FAL_KEY: "fal-secret",
    REPLICATE_API_TOKEN: "replicate-secret",
    VISIONCORE_SEGMENTATION_PROVIDER: "replicate",
    VISIONCORE_SEGMENTATION_FALLBACK_PROVIDER: "fal",
  });
  assert.equal(config.requested, "replicate");
  assert.deepEqual(config.order, ["replicate", "fal"]);
  assert.equal(config.fal_target_model, "fal-ai/sam-3-1/image");
  assert.equal(config.fal_auto_model, "fal-ai/sam2/auto-segment");
});

test("normalized detector geometry becomes a bounded integer fal box prompt", () => {
  assert.deepEqual(
    falBoxPromptV1({ x_min: 0.1, y_min: 0.2, x_max: 0.6, y_max: 0.8 }, { width: 1000, height: 500 }),
    { x_min: 100, y_min: 100, x_max: 600, y_max: 400, object_id: 1 }
  );
});

test("fal queue uses server-side key auth and returns only completed model data", async () => {
  const calls = [];
  const result = await runFalQueueV1({
    model: "fal-ai/sam-3-1/image",
    input: { image_url: "https://images.test/look.jpg" },
    env: { FAL_KEY: "fal-secret" },
    fetchImpl: successfulQueueFetch({ masks: [{ url: "https://fal.media/mask.png" }] }, calls),
    pollIntervalMs: 1,
  });
  assert.equal(result.ok, true);
  assert.equal(result.request_id, "req_123");
  assert.equal(result.data.masks[0].url, "https://fal.media/mask.png");
  assert.equal(calls[0].options.headers.Authorization, "Key fal-secret");
  assert.equal(calls[0].options.headers["X-Fal-Store-IO"], "0");
});

test("fal target segmentation sends neutral prompt plus detector box and selects strongest mask", async () => {
  const calls = [];
  const result = await runFalTargetMaskV1({
    imageUrl: "https://images.test/look.jpg",
    target: {
      prompt: "zip-front track jacket",
      bbox: { x_min: 0.2, y_min: 0.1, x_max: 0.8, y_max: 0.7 },
    },
    imageDimensions: { width: 1000, height: 1000 },
    timeoutMs: 2000,
    env: { FAL_KEY: "fal-secret" },
    fetchImpl: successfulQueueFetch({
      masks: [{ url: "https://fal.media/weak.png" }, { url: "https://fal.media/strong.png" }],
      scores: [0.71, 0.94],
    }, calls),
  });
  const submitted = JSON.parse(calls[0].options.body);
  assert.equal(submitted.prompt, "zip-front track jacket");
  assert.deepEqual(submitted.box_prompts[0], { x_min: 200, y_min: 100, x_max: 800, y_max: 700, object_id: 1 });
  assert.equal(result.mask_url, "https://fal.media/strong.png");
  assert.equal(result.score, 0.94);
});

test("fal auto segmentation maps individual masks for existing VisionCore measurement", async () => {
  const result = await runFalAutoSegmentationV1({
    imageUrl: "https://images.test/crop.png",
    timeoutMs: 2000,
    env: { FAL_KEY: "fal-secret" },
    fetchImpl: successfulQueueFetch({
      individual_masks: [{ url: "https://fal.media/a.png" }, { url: "https://fal.media/b.png" }],
    }),
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.mask_urls, ["https://fal.media/a.png", "https://fal.media/b.png"]);
});

test("fal queue rejects untrusted provider callback URLs", async () => {
  const result = await runFalQueueV1({
    model: "fal-ai/sam-3-1/image",
    input: {},
    env: { FAL_KEY: "fal-secret" },
    fetchImpl: async () => jsonResponse({
      request_id: "req_bad",
      status_url: "https://attacker.test/status",
      response_url: "https://attacker.test/response",
    }),
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "fal_invalid_queue_response");
});

test("fal provider failures expose safe codes without response payload details", async () => {
  const result = await runFalQueueV1({
    model: "fal-ai/sam-3-1/image",
    input: {},
    env: { FAL_KEY: "fal-secret" },
    fetchImpl: async () => jsonResponse({ detail: "sensitive provider internals" }, 429),
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "fal_rate_limited");
  assert.doesNotMatch(JSON.stringify(result), /sensitive provider internals/);
});
