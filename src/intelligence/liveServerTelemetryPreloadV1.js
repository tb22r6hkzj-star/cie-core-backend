import express from "express";
import { createAnalysisLatencyRuntimeV1 } from "./analysisLatencyRuntimeV1.js";
import { buildRecommendationRuntimeTelemetryV1 } from "./recommendationRuntimeTelemetryV1.js";
import { buildLiveReasoningCardsV1 } from "./liveReasoningCardsV1.js";

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

function attachReasoningCards(payload = {}) {
  if (!payload || typeof payload !== "object") return payload;
  const external = externalIntelligenceFromPayload(payload) || {};
  const reconciliation = external?.semantic_reconciliation || null;
  if (!reconciliation) return payload;

  const reasoning = buildLiveReasoningCardsV1(reconciliation);
  if (!reasoning?.cards?.length) return payload;

  if (payload?.outfit_analysis && typeof payload.outfit_analysis === "object") {
    return {
      ...payload,
      outfit_analysis: {
        ...payload.outfit_analysis,
        reasoning_cards_v1: {
          version: reasoning.version,
          authority_owner: reasoning.authority_owner,
          cards: reasoning.cards,
          publication_changed: false,
          measured_hex_changed: false,
        },
      },
    };
  }

  if (payload?.outfitAnalysis && typeof payload.outfitAnalysis === "object") {
    return {
      ...payload,
      outfitAnalysis: {
        ...payload.outfitAnalysis,
        reasoning_cards_v1: {
          version: reasoning.version,
          authority_owner: reasoning.authority_owner,
          cards: reasoning.cards,
          publication_changed: false,
          measured_hex_changed: false,
        },
      },
    };
  }

  return {
    ...payload,
    reasoning_cards_v1: {
      version: reasoning.version,
      authority_owner: reasoning.authority_owner,
      cards: reasoning.cards,
      publication_changed: false,
      measured_hex_changed: false,
    },
  };
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

        try {
          return attachReasoningCards(payload);
        } catch {
          // Card synthesis must fail open to the original analysis payload.
          return payload;
        }
      });
      return handler.call(this, req, res, next);
    };
  });
  return originalPost.call(this, path, ...wrapped);
};

export function getLiveServerTelemetryStatusV1() {
  return runtime.status();
}

export { attachReasoningCards };
