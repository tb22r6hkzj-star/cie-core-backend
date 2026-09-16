const DEFAULT_FAL_TARGET_MODEL = "fal-ai/sam-3-1/image";
const DEFAULT_FAL_AUTO_MODEL = "fal-ai/sam2/auto-segment";
const FAL_QUEUE_ORIGIN = "https://queue.fal.run";
const TERMINAL_FAILURES = new Set(["FAILED", "CANCELLED", "CANCELED"]);

function clean(value) {
  return String(value || "").trim();
}

function normalizeProvider(value) {
  const provider = clean(value).toLowerCase();
  return ["auto", "fal", "replicate", "none"].includes(provider) ? provider : "auto";
}

function providerAvailable(provider, env = process.env) {
  if (provider === "fal") return Boolean(clean(env.FAL_KEY));
  if (provider === "replicate") return Boolean(clean(env.REPLICATE_API_TOKEN));
  return false;
}

export function segmentationProviderOrderV1(env = process.env) {
  const requested = normalizeProvider(env.VISIONCORE_SEGMENTATION_PROVIDER || "auto");
  const fallback = normalizeProvider(env.VISIONCORE_SEGMENTATION_FALLBACK_PROVIDER || "replicate");
  const preferred = requested === "auto"
    ? (providerAvailable("fal", env) ? "fal" : "replicate")
    : requested;
  const order = [preferred];
  if (fallback !== "auto" && fallback !== "none" && fallback !== preferred) order.push(fallback);
  return order.filter((provider, index, values) =>
    provider !== "none" && values.indexOf(provider) === index && providerAvailable(provider, env)
  );
}

export function segmentationProviderConfigV1(env = process.env) {
  const requested = normalizeProvider(env.VISIONCORE_SEGMENTATION_PROVIDER || "auto");
  return {
    version: "segmentation_provider_v1",
    requested,
    order: segmentationProviderOrderV1(env),
    fal_target_model: clean(env.FAL_TARGET_SEGMENTATION_MODEL) || DEFAULT_FAL_TARGET_MODEL,
    fal_auto_model: clean(env.FAL_AUTO_SEGMENTATION_MODEL) || DEFAULT_FAL_AUTO_MODEL,
    fal_configured: providerAvailable("fal", env),
    replicate_configured: providerAvailable("replicate", env),
  };
}

function safeQueueUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname !== "queue.fal.run") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function errorCode(error) {
  if (error?.name === "AbortError") return "fal_timeout";
  const status = Number(error?.status || 0);
  if (status === 401 || status === 403) return "fal_auth_error";
  if (status === 429) return "fal_rate_limited";
  if (status >= 500) return "fal_provider_error";
  return clean(error?.code) || "fal_request_error";
}

async function fetchFalJson(url, { key, method = "GET", body, deadlineAt, fetchImpl = fetch } = {}) {
  const remainingMs = Math.max(1, deadlineAt - Date.now());
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), remainingMs);
  try {
    const response = await fetchImpl(url, {
      method,
      signal: controller.signal,
      headers: {
        Authorization: `Key ${key}`,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        "X-Fal-Store-IO": "0",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await response.text();
    let payload = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = null;
    }
    if (!response.ok) {
      const error = new Error(`fal request failed (${response.status})`);
      error.status = response.status;
      throw error;
    }
    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

async function cancelFalRequest(cancelUrl, key, fetchImpl) {
  const safeUrl = safeQueueUrl(cancelUrl);
  if (!safeUrl) return;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 500);
  try {
    await fetchImpl(safeUrl, {
      method: "PUT",
      signal: controller.signal,
      headers: { Authorization: `Key ${key}` },
    });
  } catch {
    // Cancellation is best effort and must not hide the original timeout.
  } finally {
    clearTimeout(timeout);
  }
}

export async function runFalQueueV1({
  model,
  input,
  timeoutMs = 16000,
  env = process.env,
  fetchImpl = fetch,
  pollIntervalMs = 350,
} = {}) {
  const key = clean(env.FAL_KEY);
  if (!key) return { enabled: false, ok: false, provider: "fal", reason: "missing_FAL_KEY" };
  const modelId = clean(model);
  if (!modelId || !/^[-a-z0-9]+\/[-a-z0-9]+(?:\/[-a-z0-9]+)*$/i.test(modelId)) {
    return { enabled: true, ok: false, provider: "fal", reason: "invalid_fal_model" };
  }

  const startedAt = Date.now();
  const effectiveTimeoutMs = Math.max(1000, Number(timeoutMs) || 16000);
  const deadlineAt = startedAt + effectiveTimeoutMs;
  let submission = null;
  try {
    submission = await fetchFalJson(`${FAL_QUEUE_ORIGIN}/${modelId}`, {
      key,
      method: "POST",
      body: input || {},
      deadlineAt,
      fetchImpl,
    });
    const requestId = clean(submission?.request_id);
    const statusUrl = safeQueueUrl(submission?.status_url);
    const responseUrl = safeQueueUrl(submission?.response_url);
    if (!requestId || !statusUrl || !responseUrl) {
      return { enabled: true, ok: false, provider: "fal", reason: "fal_invalid_queue_response" };
    }

    let status = clean(submission?.status).toUpperCase() || "IN_QUEUE";
    while (Date.now() < deadlineAt && status !== "COMPLETED" && !TERMINAL_FAILURES.has(status)) {
      const waitMs = Math.min(Math.max(25, Number(pollIntervalMs) || 350), Math.max(0, deadlineAt - Date.now()));
      if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
      if (Date.now() >= deadlineAt) break;
      const update = await fetchFalJson(statusUrl, { key, deadlineAt, fetchImpl });
      status = clean(update?.status).toUpperCase() || status;
    }

    if (status !== "COMPLETED") {
      if (!TERMINAL_FAILURES.has(status)) await cancelFalRequest(submission?.cancel_url, key, fetchImpl);
      return {
        enabled: true,
        ok: false,
        provider: "fal",
        reason: TERMINAL_FAILURES.has(status) ? "fal_prediction_failed" : "fal_timeout",
        provider_status: status || null,
        request_id: requestId,
        elapsed_ms: Date.now() - startedAt,
      };
    }

    const result = await fetchFalJson(responseUrl, { key, deadlineAt, fetchImpl });
    return {
      enabled: true,
      ok: true,
      provider: "fal",
      reason: null,
      request_id: requestId,
      elapsed_ms: Date.now() - startedAt,
      data: result?.data || result,
    };
  } catch (error) {
    if (Date.now() >= deadlineAt) await cancelFalRequest(submission?.cancel_url, key, fetchImpl);
    return {
      enabled: true,
      ok: false,
      provider: "fal",
      reason: errorCode(error),
      provider_status: Number(error?.status || 0) || null,
      elapsed_ms: Date.now() - startedAt,
    };
  }
}

function maskUrl(value) {
  if (typeof value === "string") return clean(value) || null;
  return clean(value?.url) || null;
}

function maskRows(data = {}) {
  const masks = Array.isArray(data?.masks)
    ? data.masks
    : Array.isArray(data?.individual_masks) ? data.individual_masks : [];
  const scores = Array.isArray(data?.scores) ? data.scores : [];
  const metadata = Array.isArray(data?.metadata) ? data.metadata : [];
  return masks.map((mask, index) => ({
    url: maskUrl(mask),
    score: Number(metadata[index]?.score ?? scores[index] ?? 0),
    box: metadata[index]?.box || data?.boxes?.[index] || null,
  })).filter((row) => row.url);
}

export function falBoxPromptV1(bbox, imageDimensions = {}) {
  if (!bbox) return null;
  const width = Number(imageDimensions?.width || 0);
  const height = Number(imageDimensions?.height || 0);
  if (!width || !height) return null;
  const x = Number(bbox?.x ?? bbox?.x_min ?? bbox?.left);
  const y = Number(bbox?.y ?? bbox?.y_min ?? bbox?.top);
  const w = Number(bbox?.w ?? bbox?.width ?? (Number(bbox?.x_max ?? bbox?.right) - x));
  const h = Number(bbox?.h ?? bbox?.height ?? (Number(bbox?.y_max ?? bbox?.bottom) - y));
  if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) return null;
  const normalized = x <= 1 && y <= 1 && w <= 1 && h <= 1;
  const xMin = normalized ? x * width : x;
  const yMin = normalized ? y * height : y;
  const xMax = normalized ? (x + w) * width : x + w;
  const yMax = normalized ? (y + h) * height : y + h;
  const result = {
    x_min: Math.max(0, Math.min(width - 1, Math.floor(xMin))),
    y_min: Math.max(0, Math.min(height - 1, Math.floor(yMin))),
    x_max: Math.max(1, Math.min(width, Math.ceil(xMax))),
    y_max: Math.max(1, Math.min(height, Math.ceil(yMax))),
    object_id: 1,
  };
  return result.x_max > result.x_min && result.y_max > result.y_min ? result : null;
}

export async function runFalTargetMaskV1({ imageUrl, target, imageDimensions, timeoutMs, env, fetchImpl } = {}) {
  const box = falBoxPromptV1(target?.bbox, imageDimensions);
  const response = await runFalQueueV1({
    model: clean(env?.FAL_TARGET_SEGMENTATION_MODEL) || DEFAULT_FAL_TARGET_MODEL,
    input: {
      image_url: imageUrl,
      prompt: clean(target?.prompt || target?.label) || "garment",
      ...(box ? { box_prompts: [box] } : {}),
      apply_mask: false,
      output_format: "png",
      return_multiple_masks: true,
      max_masks: 3,
      include_scores: true,
      include_boxes: true,
    },
    timeoutMs,
    env,
    fetchImpl,
  });
  if (!response.ok) return response;
  const rows = maskRows(response.data).sort((a, b) => b.score - a.score);
  if (!rows.length) return { ...response, ok: false, reason: "fal_target_mask_missing" };
  return { ...response, mask_url: rows[0].url, score: rows[0].score, mask_candidates: rows.length };
}

export async function runFalAutoSegmentationV1({ imageUrl, timeoutMs, env, fetchImpl } = {}) {
  const response = await runFalQueueV1({
    model: clean(env?.FAL_AUTO_SEGMENTATION_MODEL) || DEFAULT_FAL_AUTO_MODEL,
    input: {
      image_url: imageUrl,
      output_format: "png",
      points_per_side: 32,
      pred_iou_thresh: 0.88,
      stability_score_thresh: 0.95,
      min_mask_region_area: 64,
    },
    timeoutMs,
    env,
    fetchImpl,
  });
  if (!response.ok) return response;
  const rows = maskRows(response.data);
  if (!rows.length) return { ...response, ok: false, reason: "fal_auto_masks_missing" };
  return { ...response, mask_urls: rows.map((row) => row.url) };
}
