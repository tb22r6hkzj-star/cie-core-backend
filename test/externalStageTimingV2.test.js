import test from "node:test";
import assert from "node:assert/strict";
import { classifyExternalStageV2, summarizeExternalStageEventsV2 } from "../src/intelligence/externalStageTimingV2.js";

test("classifies the major VisionCore external providers without storing payload contents", () => {
  assert.equal(classifyExternalStageV2("https://api.openai.com/v1/responses"), "openai_http");
  assert.equal(classifyExternalStageV2("https://api.replicate.com/v1/predictions"), "replicate_http");
  assert.equal(
    classifyExternalStageV2("https://api.pixelcut.ai/v1/background-removal", { PIXELCUT_ENDPOINT: "https://api.pixelcut.ai" }),
    "pixelcut_http"
  );
  assert.equal(classifyExternalStageV2("https://res.cloudinary.com/demo/image/upload/test.jpg"), "cloudinary_http");
  assert.equal(classifyExternalStageV2("https://example.test/api"), "external_http");
});

test("summarizes repeated provider calls into request-scoped stage totals", () => {
  const result = summarizeExternalStageEventsV2([
    { stage: "replicate_http", latency_ms: 4200 },
    { stage: "replicate_http", latency_ms: 1800 },
    { stage: "openai_http", latency_ms: 3100 },
    { stage: "pixelcut_http", latency_ms: 2500 },
  ]);
  assert.equal(result.request_count, 4);
  assert.equal(result.external_http_total, 11600);
  assert.equal(result.stages_ms.replicate_http, 6000);
  assert.equal(result.stages_ms.openai_http, 3100);
  assert.equal(result.stages_ms.pixelcut_http, 2500);
});

test("invalid or missing URLs fall back to generic external timing", () => {
  assert.equal(classifyExternalStageV2(null), "external_http");
  assert.equal(classifyExternalStageV2({}), "external_http");
});
