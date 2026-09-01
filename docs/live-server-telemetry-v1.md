# Live Server Telemetry V1

Production starts preload `src/intelligence/liveServerTelemetryPreloadV1.js` before `src/server.js`.

The preload wraps only `/api/recommendations` and `/api/debug/status` registration. Recommendation responses are timed and converted into the existing privacy-safe telemetry contract. Debug status receives the bounded in-memory latency summary.

Telemetry failures never fail or mutate a customer analysis. The runtime stores no image data, prompts, garment contents, semantic payloads, or user identity.

This hook intentionally does not change VisionCore color math, publication authority, or the recommendation response payload.
