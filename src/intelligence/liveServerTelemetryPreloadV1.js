import express from "express";
import { AsyncLocalStorage } from "node:async_hooks";
import { createAnalysisLatencyRuntimeV1 } from "./analysisLatencyRuntimeV1.js";
import { buildRecommendationRuntimeTelemetryV1 } from "./recommendationRuntimeTelemetryV1.js";
import { buildLiveReasoningCardsV1 } from "./liveReasoningCardsV1.js";
import { classifyExternalStageV2, summarizeExternalStageEventsV2 } from "./externalStageTimingV2.js";
import { reconcileAccessoryPublicationPayloadV1 } from "./accessoryPublicationBridgeV1.js";

const runtime = createAnalysisLatencyRuntimeV1({ maxRecords: 500 });
const originalGet = express.application.get;
const originalPost = express.application.post;
const requestTimingScope = new AsyncLocalStorage();
const originalFetch = typeof globalThis.fetch === "function" ? globalThis.fetch.bind(globalThis) : null;
const INSTRUMENTED_POST_ROUTES = new Set(["/api/recommendations", "/api/images/transform"]);

if (originalFetch) {
  globalThis.fetch = async function visionCoreTimedFetch(input, init) {
    const scope = requestTimingScope.getStore();
    if (!scope) return originalFetch(input, init);
    const stage = classifyExternalStageV2(input);
    const startedAtMs = Date.now();
    try {
      return await originalFetch(input, init);
    } finally {
      scope.external_events.push({
        stage,
        latency_ms: Date.now() - startedAtMs,
      });
    }
  };
}

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
    || payload?.debug?.external_intelligence
    || null;
}

function attachReasoningCards(payload = {}) {
  if (!payload || typeof payload !== "object") return payload;
  const external = externalIntelligenceFromPayload(payload) || {};
  const reconciliation = external?.semantic_reconciliation || null;
  if (!reconciliation) return payload;

  const reasoning = buildLiveReasoningCardsV1(reconciliation);
  if (!reasoning?.cards?.length) return payload;

  const field = {
    version: reasoning.version,
    authority_owner: reasoning.authority_owner,
    cards: reasoning.cards,
    publication_changed: false,
    measured_hex_changed: false,
  };

  if (payload?.outfit_analysis && typeof payload.outfit_analysis === "object") {
    return {
      ...payload,
      outfit_analysis: {
        ...payload.outfit_analysis,
        reasoning_cards_v1: field,
      },
    };
  }

  if (payload?.outfitAnalysis && typeof payload.outfitAnalysis === "object") {
    return {
      ...payload,
      outfitAnalysis: {
        ...payload.outfitAnalysis,
        reasoning_cards_v1: field,
      },
    };
  }

  return { ...payload, reasoning_cards_v1: field };
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

function runtimeStages(record, scope) {
  const externalTiming = summarizeExternalStageEventsV2(scope?.external_events || []);
  return {
    ...(record?.stages_ms || {}),
    ...externalTiming.stages_ms,
    external_http_total: externalTiming.external_http_total,
    external_http_request_count: externalTiming.request_count,
  };
}

function applyLivePublicationGuards(payload = {}) {
  const bridged = reconcileAccessoryPublicationPayloadV1(payload);
  return attachReasoningCards(bridged);
}

function buildInstrumentationMiddleware(path) {
  return function liveAnalysisInstrumentation(req, res, next) {
    const startedAtMs = Date.now();
    const scope = { external_events: [], route: path };

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
          stages: {
            ...runtimeStages(record, scope),
            route_images_transform: path === "/api/images/transform" ? Number(record?.total_ms || 0) : null,
            route_recommendations: path === "/api/recommendations" ? Number(record?.total_ms || 0) : null,
          },
          secondPass: record?.second_pass || {},
        });
      } catch {
        // Telemetry is observational only and must never fail analysis.
      }

      try {
        return applyLivePublicationGuards(payload);
      } catch {
        // Publication guards must fail open to the original analysis payload.
        return payload;
      }
    });

    return requestTimingScope.run(scope, () => next());
  };
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
  if (!INSTRUMENTED_POST_ROUTES.has(path)) return originalPost.call(this, path, ...handlers);
  return originalPost.call(this, path, buildInstrumentationMiddleware(path), ...handlers);
};

export function getLiveServerTelemetryStatusV1() {
  return runtime.status();
}

export { attachReasoningCards, applyLivePublicationGuards };
