function safeUrl(input) {
  try {
    if (typeof input === "string") return new URL(input);
    if (input?.url) return new URL(input.url);
  } catch {
    return null;
  }
  return null;
}

export function classifyExternalStageV2(input, env = process.env) {
  const url = safeUrl(input);
  if (!url) return "external_http";
  const host = String(url.hostname || "").toLowerCase();
  const href = String(url.href || "").toLowerCase();
  const pixelcutEndpoint = String(env?.PIXELCUT_ENDPOINT || "").toLowerCase();

  if (host === "api.openai.com" || host.endsWith(".openai.com")) return "openai_http";
  if (host === "api.replicate.com" || host.endsWith(".replicate.com")) return "replicate_http";
  if (href.includes("pixelcut") || (pixelcutEndpoint && href.startsWith(pixelcutEndpoint))) return "pixelcut_http";
  if (host.includes("cloudinary.com")) return "cloudinary_http";
  return "external_http";
}

function safeMs(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : 0;
}

export function summarizeExternalStageEventsV2(events = []) {
  const stages = {};
  let total = 0;
  let count = 0;
  for (const event of Array.isArray(events) ? events : []) {
    const stage = String(event?.stage || "external_http");
    const latency = safeMs(event?.latency_ms);
    stages[stage] = safeMs((stages[stage] || 0) + latency);
    total += latency;
    count += 1;
  }
  return {
    version: "external_stage_timing_v2",
    request_count: count,
    external_http_total: safeMs(total),
    stages_ms: stages,
  };
}
