import chroma from "chroma-js";

function clamp01(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function safeHex(value) {
  try {
    return chroma(value).hex().toUpperCase();
  } catch {
    return null;
  }
}

function normalizeBox(box = {}, width = 0, height = 0) {
  let x = Number(box.x ?? box.left ?? box.x_min);
  let y = Number(box.y ?? box.top ?? box.y_min);
  let w = Number(box.width);
  let h = Number(box.height);
  const right = Number(box.right ?? box.x_max);
  const bottom = Number(box.bottom ?? box.y_max);
  if (!Number.isFinite(w) && Number.isFinite(right) && Number.isFinite(x)) w = right - x;
  if (!Number.isFinite(h) && Number.isFinite(bottom) && Number.isFinite(y)) h = bottom - y;
  if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) return null;

  if (x > 1 || y > 1 || w > 1 || h > 1) {
    if (!width || !height) return null;
    x /= width;
    w /= width;
    y /= height;
    h /= height;
  }

  const nx = clamp01(x);
  const ny = clamp01(y);
  const nr = clamp01(x + w);
  const nb = clamp01(y + h);
  if (nr <= nx || nb <= ny) return null;
  return { x: nx, y: ny, right: nr, bottom: nb, width: nr - nx, height: nb - ny };
}

function contains(box, x, y) {
  return !!box && x >= box.x && x <= box.right && y >= box.y && y <= box.bottom;
}

function normalizeExclusions(exclusions = [], width = 0, height = 0) {
  return (Array.isArray(exclusions) ? exclusions : [])
    .map((box) => normalizeBox(box, width, height))
    .filter(Boolean);
}

/**
 * DINO Interior Measurement V1
 *
 * DINO provides object location. It does not own color authority by itself.
 * This sampler intentionally moves inward from the detected box before pixels
 * are allowed to vote, then removes any positively-owned overlap exclusions.
 *
 * The resulting palette is measured evidence only. Publication still requires
 * Measurement Authority V1 to verify positive piece ownership.
 */
export function measureDinoInteriorPixelsV1({
  decodedImage,
  bbox,
  exclusions = [],
  insetRatio = 0.12,
  maxSamples = 14000,
  limit = 6,
} = {}) {
  const width = Number(decodedImage?.width || 0);
  const height = Number(decodedImage?.height || 0);
  const data = decodedImage?.data;
  const target = normalizeBox(bbox, width, height);
  if (!width || !height || !data || !target) {
    return { available: false, reason: "missing_image_or_bbox", colors: [] };
  }

  const inset = Math.max(0, Math.min(0.35, Number(insetRatio) || 0));
  const inner = {
    x: target.x + target.width * inset,
    y: target.y + target.height * inset,
    right: target.right - target.width * inset,
    bottom: target.bottom - target.height * inset,
  };
  inner.width = inner.right - inner.x;
  inner.height = inner.bottom - inner.y;
  if (inner.width <= 0 || inner.height <= 0) {
    return { available: false, reason: "inset_removed_region", colors: [] };
  }

  const excluded = normalizeExclusions(exclusions, width, height);
  const x0 = Math.max(0, Math.floor(inner.x * width));
  const y0 = Math.max(0, Math.floor(inner.y * height));
  const x1 = Math.min(width, Math.ceil(inner.right * width));
  const y1 = Math.min(height, Math.ceil(inner.bottom * height));
  const area = Math.max(1, (x1 - x0) * (y1 - y0));
  const stride = Math.max(1, Math.floor(Math.sqrt(area / Math.max(1, maxSamples))));

  const buckets = new Map();
  let sampled = 0;
  let excludedCount = 0;

  for (let py = y0; py < y1; py += stride) {
    for (let px = x0; px < x1; px += stride) {
      const nx = (px + 0.5) / width;
      const ny = (py + 0.5) / height;
      if (excluded.some((box) => contains(box, nx, ny))) {
        excludedCount += 1;
        continue;
      }
      const idx = (py * width + px) * 4;
      const alpha = Number(data[idx + 3] ?? 255);
      if (alpha < 32) continue;
      const r = Number(data[idx] || 0);
      const g = Number(data[idx + 1] || 0);
      const b = Number(data[idx + 2] || 0);
      const key = `${Math.round(r / 16)}_${Math.round(g / 16)}_${Math.round(b / 16)}`;
      if (!buckets.has(key)) buckets.set(key, { count: 0, r: 0, g: 0, b: 0 });
      const row = buckets.get(key);
      row.count += 1;
      row.r += r;
      row.g += g;
      row.b += b;
      sampled += 1;
    }
  }

  if (!sampled) return { available: false, reason: "no_interior_pixels", colors: [] };

  const colors = [...buckets.values()]
    .map((row) => ({
      hex: safeHex(chroma(
        Math.round(row.r / row.count),
        Math.round(row.g / row.count),
        Math.round(row.b / row.count)
      ).hex()),
      pct: row.count / sampled,
      pixel_count: row.count,
      sample_count: row.count,
      source: "dino_bbox_interior",
      measurement_source: "dino_bbox_interior",
      traceable_to_pixels: true,
      interior_ratio: 1 - inset * 2,
    }))
    .filter((row) => !!row.hex)
    .sort((a, b) => b.pixel_count - a.pixel_count)
    .slice(0, Math.max(1, limit));

  return {
    available: colors.length > 0,
    version: "dino_interior_measurement_v1",
    source: "dino_bbox_interior",
    colors,
    sample_count: sampled,
    excluded_sample_count: excludedCount,
    inset_ratio: inset,
    policy: {
      dino_detection_does_not_equal_color_authority: true,
      boundary_pixels_are_not_first_class_votes: true,
      measured_hexes_are_preserved: true,
    },
  };
}
