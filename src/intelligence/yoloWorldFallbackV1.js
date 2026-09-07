const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));
const round6 = (value) => Math.round(Number(value || 0) * 1e6) / 1e6;

function detectionRows(value) {
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap(detectionRows);
  if (["x0", "y0", "x1", "y1"].every((key) => Number.isFinite(Number(value[key])))) return [value];
  return Object.values(value).flatMap(detectionRows);
}

export function yoloClassNamesFromQueryV1(query = "") {
  return [...new Set(String(query).split(/[.,]/).map((value) => value.trim()).filter(Boolean))].join(", ");
}

export function parseYoloWorldOutputV1(output, { imageWidth, imageHeight } = {}) {
  let payload = output?.json_str ?? output;
  if (typeof payload === "string") {
    try { payload = JSON.parse(payload); } catch { return []; }
  }
  const width = Number(imageWidth || 0);
  const height = Number(imageHeight || 0);
  if (!(width > 0) || !(height > 0)) return [];

  return detectionRows(payload).map((row) => {
    const x0 = clamp01(Number(row.x0) / width);
    const y0 = clamp01(Number(row.y0) / height);
    const x1 = clamp01(Number(row.x1) / width);
    const y1 = clamp01(Number(row.y1) / height);
    if (x1 <= x0 || y1 <= y0) return null;
    return {
      label: String(row.cls || row.class_name || row.label || "object").trim().toLowerCase(),
      confidence: Math.round(clamp01(row.score ?? row.confidence) * 100) / 100,
      bbox: {
        x_min: round6(x0), y_min: round6(y0), x_max: round6(x1), y_max: round6(y1),
        width: round6(x1 - x0), height: round6(y1 - y0),
      },
      source_type: "dino_detection",
      detector_provider: "yolo_world_xl",
    };
  }).filter(Boolean);
}
