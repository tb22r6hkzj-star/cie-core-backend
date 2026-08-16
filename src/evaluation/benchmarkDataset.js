export const VEF_BENCHMARK_SCHEMA_VERSION = "vef_benchmark_v1";

function asArray(value) {
  return Array.isArray(value) ? value.filter((item) => item !== undefined && item !== null) : [];
}

function clamp01(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.min(1, number));
}

function normalizeConfidenceRange(value) {
  const range = Array.isArray(value) ? value : [0, 1];
  const low = clamp01(range[0], 0);
  const high = clamp01(range[1], 1);
  return low <= high ? [low, high] : [high, low];
}

export function normalizeBenchmarkSample(sample = {}) {
  const imageId = String(sample?.image_id || "").trim();
  if (!imageId) throw new Error("VEF benchmark sample requires image_id");

  return {
    schema_version: VEF_BENCHMARK_SCHEMA_VERSION,
    image_id: imageId,
    image_uri: sample?.image_uri ? String(sample.image_uri) : null,
    expected_objects: asArray(sample?.expected_objects).map(String),
    expected_colors: asArray(sample?.expected_colors),
    expected_publication_state: sample?.expected_publication_state ?? null,
    expected_confidence_range: normalizeConfidenceRange(sample?.expected_confidence_range),
    expected_evidence_chain: asArray(sample?.expected_evidence_chain).map(String),
    expected_dominant_color: sample?.expected_dominant_color ?? null,
    expected_secondary_colors: asArray(sample?.expected_secondary_colors),
    ground_truth_notes: sample?.ground_truth_notes ? String(sample.ground_truth_notes) : null,
    metadata: sample?.metadata && typeof sample.metadata === "object" ? { ...sample.metadata } : {},
  };
}

export function createBenchmarkDataset({ dataset_id, samples = [], metadata = {} } = {}) {
  const datasetId = String(dataset_id || "").trim();
  if (!datasetId) throw new Error("VEF benchmark dataset requires dataset_id");

  return {
    schema_version: VEF_BENCHMARK_SCHEMA_VERSION,
    dataset_id: datasetId,
    samples: asArray(samples).map(normalizeBenchmarkSample),
    metadata: metadata && typeof metadata === "object" ? { ...metadata } : {},
  };
}

export function loadBenchmarkDataset(input) {
  let value = input;
  if (Buffer.isBuffer(value)) value = value.toString("utf8");
  if (typeof value === "string") value = JSON.parse(value);
  if (!value || typeof value !== "object") throw new Error("VEF benchmark dataset must be an object or JSON string");
  return createBenchmarkDataset(value);
}
