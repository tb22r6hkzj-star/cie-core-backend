import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { getLiveServerTelemetryStatusV1 } from "../src/intelligence/liveServerTelemetryPreloadV1.js";

async function withServer(app, fn) {
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  try {
    const address = server.address();
    await fn(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("live preload records recommendation latency and exposes debug status", async () => {
  const app = express();
  app.get("/api/debug/status", (_req, res) => res.json({ ok: true, service: "test" }));
  app.post("/api/recommendations", async (_req, res) => {
    await new Promise((resolve) => setTimeout(resolve, 5));
    res.json({
      success: true,
      outfit_analysis: {
        external_intelligence: {
          latency_ms: 3,
          runtime_second_pass_v1: {
            executed_count: 1,
            latency_ms: 2,
            results: [{ plan: { action: "semantic_reassessment" } }],
          },
        },
      },
    });
  });

  await withServer(app, async (baseUrl) => {
    const recommendation = await fetch(`${baseUrl}/api/recommendations`, { method: "POST" });
    assert.equal(recommendation.status, 200);
    const recommendationBody = await recommendation.json();
    assert.equal(recommendationBody.success, true);

    const statusResponse = await fetch(`${baseUrl}/api/debug/status`);
    assert.equal(statusResponse.status, 200);
    const statusBody = await statusResponse.json();
    assert.equal(statusBody.ok, true);
    assert.equal(statusBody.analysis_latency.version, "analysis_latency_runtime_v1");
    assert.ok(statusBody.analysis_latency.aggregate.sample_count >= 1);
    assert.equal(statusBody.analysis_latency.latest.second_pass.used, true);
    assert.equal(statusBody.analysis_latency.latest.second_pass.action, "semantic_reassessment");
    assert.equal(statusBody.analysis_latency.policy.stores_image_data, false);
  });

  assert.ok(getLiveServerTelemetryStatusV1().aggregate.sample_count >= 1);
});
