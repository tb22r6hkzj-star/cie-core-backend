import express from "express";
import { createAnalysisLatencyRuntimeV1 } from "./analysisLatencyRuntimeV1.js";
import { buildRecommendationRuntimeTelemetryV1 } from "./recommendationRuntimeTelemetryV1.js";

const runtime = createAnalysisLatencyRuntimeV1({ maxRecords: 500 });
const originalGet = express.application.get;
const originalPost = express.application.post;

function wrapJson(res, transform) {
  const originalJson = res.json.bind(res);
  let sent = false;
  res.json = (payload) => {
    if (sent) return res;
    sent = true;
    let next = payload;
    try {
      next = transform(payload) ?? payload;
    } catch {
      next = payload;
    }
    return originalJson(next);
  };
}

function externalIntelligenceFromPayload(payload = {}) {
  return payload?.outfit_analysis?.external_intelligence
    || payload?.outfitAnalysis?.external_intelligence
    || payload?.external_intelligence
    || null;
}

function recommendationTelemetryRecord({ payload, startedAtMs, finishedAtMs }) {
  const external = externalIntelligenceFromPayload(payload) || {};
  const secondPass = external?.runtime_second_pass_v1 || external?.second_pass || null;
  const openAIResult = {
    latency_ms: external?.latency_ms ?? external?.provider_latency_ms ?? null,
  };
  return buildRecommendationRuntimeTelemetryV1({
    requestStartedAtMs: startedAtMs,
    requestFinishedAtMs: finishedAtMs,
    openAIResult,
    secondPassResult: secondPass,
  });
}

express.application.get = function patchedGet(path, ...handlers) {
  if (path !== "/api/debug/status") return originalGet.call(this, path, ...handlers);
  const wrapped = handlers.map((handler) => {
    if (typeof handler !== "function") return handler;
    return function liveDebugTelemetry(req, res, next) {
      wrapJson(res, (payload) => ({
        ...(payload && typeof payload === "object" ? payload : {}),
        analysis_latency: runtime.status(),
      }));
      return handler.call(this, req, res, next);
    };
  });
  return originalGet.call(this, path, ...wrapped);
};

express.application.post = function patchedPost(path, ...handlers) {
  if (path !== "/api/recommendations") return originalPost.call(this, path, ...handlers);
  const wrapped = handlers.map((handler) => {
    if (typeof handler !== "function") return handler;
    return function liveRecommendationTelemetry(req, res, next) {
      const startedAtMs = Date.now();
      wrapJson(res, (payload) => {
        try {
          const record = recommendationTelemetryRecord({
            payload,
            startedAtMs,
            finishedAtMs: Date.now(),
          });
          runtime.recordAnalysis({
            startedAtMs,
            finishedAtMs: startedAtMs + Number(record?.total_ms || 0),
            stages: record?.stages_ms || {},
            secondPass: record?.second_pass || {},
          });
        } catch {
          // Telemetry is observational only and must never fail analysis.
        }
        return payload;
      });
      return handler.call(this, req, res, next);
    };
  });
  return originalPost.call(this, path, ...wrapped);
};

export function getLiveServerTelemetryStatusV1() {
  return runtime.status();
}
