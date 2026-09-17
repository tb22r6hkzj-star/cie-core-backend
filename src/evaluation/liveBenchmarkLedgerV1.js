import crypto from "node:crypto";
import { v2 as cloudinary } from "cloudinary";

const PREFIX = "visioncore/benchmark/runs";
const SCHEMA_VERSION = "visioncore_live_benchmark_run_v1";

function clone(value) {
  return value === undefined ? null : JSON.parse(JSON.stringify(value));
}

function cleanText(value, maximum = 240) {
  return String(value ?? "").trim().slice(0, maximum);
}

function bool(value) {
  return value === true || String(value || "").toLowerCase() === "true";
}

function runId(now = new Date(), randomBytes = crypto.randomBytes) {
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  return `VC-${stamp}-${randomBytes(2).toString("hex").toUpperCase()}`;
}

function sha256(buffer) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) return null;
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function imageFileFromRequest(req = {}) {
  if (Array.isArray(req.files)) return req.files.find((file) => file?.buffer) || req.files[0] || null;
  return req.file || null;
}

export function benchmarkCollectionRequestedV1(req = {}) {
  const bodyValue = req?.body?.benchmarkMode ?? req?.body?.benchmark_mode;
  const headerValue = req?.headers?.["x-visioncore-benchmark"];
  return bool(bodyValue) || ["collect", "true", "1"].includes(String(headerValue || "").toLowerCase());
}

export function buildLiveBenchmarkRecordV1({
  req = {},
  payload = {},
  route = "/api/images/transform",
  startedAtMs = Date.now(),
  finishedAtMs = Date.now(),
  now = new Date(),
  id = null,
} = {}) {
  const file = imageFileFromRequest(req);
  const result = clone(payload);
  const analysis = result?.outfit_analysis || result?.outfitAnalysis || {};
  const external = analysis?.external_intelligence || result?.external_intelligence || result?.debug?.external_intelligence || null;
  const resolvedId = cleanText(id || runId(now), 100);

  return {
    schema_version: SCHEMA_VERSION,
    run_id: resolvedId,
    dataset_id: "visioncore-golden-benchmark-v1",
    collection_status: "captured_unreviewed",
    annotation_status: "unreviewed",
    benchmark_eligible: false,
    captured_at: now.toISOString(),
    route,
    source: {
      original_filename: cleanText(file?.originalname, 180) || null,
      mime_type: cleanText(file?.mimetype, 100) || null,
      byte_size: Number(file?.size || file?.buffer?.length || 0) || null,
      sha256: sha256(file?.buffer),
      image_uri: result?.ghostImageUrl || result?.imageUrl || result?.image_url || null,
      original_file_required_for_adjudication: true,
    },
    runtime: {
      started_at_ms: Number(startedAtMs) || null,
      finished_at_ms: Number(finishedAtMs) || null,
      total_ms: Math.max(0, Number(finishedAtMs) - Number(startedAtMs)),
      engine: result?.engine || result?.pipeline || null,
      external_intelligence_mode: external?.mode || external?.configured_mode || null,
      external_intelligence_latency_ms: external?.latency_ms ?? external?.provider_latency_ms ?? null,
      second_pass_executed_count: external?.runtime_second_pass_v1?.executed_count ?? null,
    },
    original_result: result,
    review: {
      failure_labels: [],
      notes: null,
      annotators: [],
      adjudicator: null,
    },
    policy: {
      original_result_is_immutable: true,
      model_output_is_not_ground_truth: true,
      two_annotators_required: true,
      adjudication_required_before_benchmark_use: true,
      corrections_cannot_rewrite_original_result: true,
    },
  };
}

export async function persistLiveBenchmarkRecordV1(record, { uploader = cloudinary.uploader } = {}) {
  if (record?.schema_version !== SCHEMA_VERSION || !record?.run_id) {
    throw new Error("A valid VisionCore live benchmark record is required");
  }
  const json = JSON.stringify(record);
  const dataUri = `data:application/json;base64,${Buffer.from(json).toString("base64")}`;
  const result = await uploader.upload(dataUri, {
    resource_type: "raw",
    type: "authenticated",
    public_id: `${PREFIX}/${record.run_id}.json`,
    overwrite: false,
    context: `schema=${SCHEMA_VERSION}|status=${record.collection_status}`,
  });
  return {
    run_id: record.run_id,
    stored: true,
    storage: "cloudinary_authenticated_raw",
    public_id: result?.public_id || `${PREFIX}/${record.run_id}.json`,
    bytes: Number(result?.bytes || Buffer.byteLength(json)),
  };
}

export async function captureLiveBenchmarkRunV1(input, options = {}) {
  const record = buildLiveBenchmarkRecordV1(input);
  const persistence = await persistLiveBenchmarkRecordV1(record, options);
  return { record, persistence };
}

export async function getLiveBenchmarkStatusV1({ api = cloudinary.api } = {}) {
  let nextCursor;
  let captured = 0;
  do {
    const page = await api.resources({
      resource_type: "raw",
      type: "authenticated",
      prefix: `${PREFIX}/VC-`,
      max_results: 500,
      next_cursor: nextCursor,
    });
    captured += Array.isArray(page?.resources) ? page.resources.length : 0;
    nextCursor = page?.next_cursor || null;
  } while (nextCursor);

  return {
    version: "live_benchmark_status_v1",
    dataset_id: "visioncore-golden-benchmark-v1",
    target: 100,
    captured_unreviewed: captured,
    remaining_to_capture: Math.max(0, 100 - captured),
    adjudicated: null,
    note: "Captured runs do not become benchmark ground truth until annotation and adjudication are complete.",
  };
}

export const LIVE_BENCHMARK_SCHEMA_VERSION = SCHEMA_VERSION;
