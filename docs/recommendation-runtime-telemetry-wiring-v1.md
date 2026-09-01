# Recommendation Runtime Telemetry Wiring V1

This adapter is intended for the live `/api/recommendations` route.

## Route integration contract

At request start capture `requestStartedAtMs = Date.now()` and a request id. Capture VisionCore start/finish timestamps around the core analysis path, reuse the OpenAI observer's existing `latency_ms`, capture synthesis start/finish timestamps, and pass the executed second-pass result through unchanged to the adapter.

Immediately before the successful response, call `buildRecommendationRuntimeTelemetryV1(...)`, push only that sanitized record into `createLatencyTelemetryBufferV1()`, and optionally surface the record in debug/admin output. Do not add image URLs, uploaded bytes, garments, prompts, semantic observations, or user identity to the telemetry record.

The route should not block or fail a customer analysis if telemetry collection fails. Telemetry is observational only and has no publication authority.
