import test from "node:test";
import assert from "node:assert/strict";
import { buildOpenAISemanticRequestV1, runOpenAISemanticObserverV1 } from "../src/intelligence/external/openaiSemanticObserverV1.js";

test("request grants OpenAI semantic observation but no color authority", () => {
  const request = buildOpenAISemanticRequestV1({ imageUrl: "https://example.test/outfit.jpg", visionCoreEvidence: { publication: "confirmed" } });
  const prompt = request.input[0].content[0].text;
  assert.match(prompt, /not the final authority/i);
  assert.match(prompt, /Do not calculate or override hex/i);
  assert.equal(request.input[0].content[1].detail, "high");
  assert.equal(request.text.format.strict, true);
  assert.equal(request.store, false);
});

test("off mode makes no provider call", async () => {
  let called = false;
  const result = await runOpenAISemanticObserverV1({ mode: "off", fetchImpl: async () => { called = true; } });
  assert.equal(called, false);
  assert.equal(result.skipped, true);
});

test("shadow call is sanitized and cannot change publication", async () => {
  const fetchImpl = async () => ({
    ok: true,
    json: async () => ({
      output_text: JSON.stringify({
        schema_version: "1",
        overall_confidence: 0.95,
        hex: "#FF0000",
        claims: [{ action: "contradict", piece: "belt", zone: "waist", pattern: "solid", material_cue: "leather", ownership_hypothesis: "dark pixels belong to belt", reason: "thin waist object", confidence: 0.9, hex: "#000000" }],
      }),
      usage: { input_tokens: 3000, output_tokens: 400 },
    }),
  });
  const result = await runOpenAISemanticObserverV1({
    mode: "shadow",
    apiKey: "test-key",
    imageUrl: "https://example.test/outfit.jpg",
    visionCoreDecision: { publication_state: "confirmed", primary_color: { hex: "#3F5041" } },
    fetchImpl,
  });
  assert.equal(result.ok, true);
  assert.equal(result.handoff.publication_changed, false);
  assert.equal(result.handoff.semantic_observation.hex, undefined);
  assert.equal(result.handoff.semantic_observation.claims[0].hex, undefined);
  assert.ok(result.estimated_cost_usd < 0.03);
});

test("provider failure fails open to VisionCore", async () => {
  const result = await runOpenAISemanticObserverV1({
    mode: "assist",
    apiKey: "test-key",
    imageUrl: "https://example.test/outfit.jpg",
    fetchImpl: async () => ({ ok: false, status: 503 }),
  });
  assert.equal(result.ok, false);
  assert.equal(result.fail_open, true);
  assert.equal(result.handoff.authority_owner, "visioncore");
});

test("semantic timeout is bounded and still fails open", async () => {
  let aborted = false;
  const result = await runOpenAISemanticObserverV1({
    mode: "shadow",
    apiKey: "test-key",
    imageUrl: "https://example.test/outfit.jpg",
    timeoutMs: 1,
    fetchImpl: async (_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => {
        aborted = true;
        const error = new Error("aborted");
        error.name = "AbortError";
        reject(error);
      });
    }),
  });
  assert.equal(aborted, true);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "external_timeout");
  assert.equal(result.fail_open, true);
});

test("image-hash cache prevents repeat model calls", async () => {
  let calls = 0;
  const cache = new Map();
  const options = {
    mode: "shadow", apiKey: "test-key", imageUrl: "https://example.test/outfit.jpg", cache, cacheKey: "hash:pipeline:model:schema",
    fetchImpl: async () => { calls += 1; return { ok: true, json: async () => ({ output_text: JSON.stringify({ schema_version: "1", overall_confidence: 0, claims: [] }), usage: {} }) }; },
  };
  await runOpenAISemanticObserverV1(options);
  const second = await runOpenAISemanticObserverV1(options);
  assert.equal(calls, 1);
  assert.equal(second.cached, true);
});

test("Terra usage is priced at Terra rates before the cost gate", async () => {
  const result = await runOpenAISemanticObserverV1({
    mode: "shadow",
    apiKey: "test-key",
    imageUrl: "https://example.test/outfit.jpg",
    model: "gpt-5.6-terra",
    fetchImpl: async () => ({ ok: true, json: async () => ({
      output_text: JSON.stringify({ schema_version: "1", overall_confidence: 0, claims: [] }),
      usage: { input_tokens: 3000, output_tokens: 500 },
    }) }),
  });
  assert.equal(result.ok, true);
  assert.equal(result.estimated_cost_usd, 0.012);
});
