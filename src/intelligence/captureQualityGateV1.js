const VERSION = "capture_quality_gate_v1";
const MAX_SAMPLES = 25000;

function clamp01(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : 0;
}

function round(value, digits = 4) {
  const scale = 10 ** digits;
  return Math.round(Number(value || 0) * scale) / scale;
}

function percentile(sorted, ratio) {
  if (!sorted.length) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * ratio)));
  return sorted[index];
}

function luminance(r, g, b) {
  return (0.2126 * r) + (0.7152 * g) + (0.0722 * b);
}

function issue(code, severity, evidence, guidance) {
  return { code, severity, evidence, guidance };
}

function validImage(decodedImage) {
  const width = Number(decodedImage?.width || 0);
  const height = Number(decodedImage?.height || 0);
  const data = decodedImage?.data;
  return width > 0 && height > 0 && data && data.length >= width * height * 4;
}

function sampleImage(decodedImage) {
  const width = Number(decodedImage.width);
  const height = Number(decodedImage.height);
  const data = decodedImage.data;
  const pixelCount = width * height;
  const step = Math.max(1, Math.floor(pixelCount / MAX_SAMPLES));
  const luma = [];
  let rTotal = 0;
  let gTotal = 0;
  let bTotal = 0;
  let dark = 0;
  let bright = 0;
  let opaque = 0;
  let edgeTotal = 0;
  let edgeCount = 0;

  for (let pixel = 0; pixel < pixelCount; pixel += step) {
    const offset = pixel * 4;
    if (Number(data[offset + 3] ?? 255) < 64) continue;
    const r = Number(data[offset] || 0);
    const g = Number(data[offset + 1] || 0);
    const b = Number(data[offset + 2] || 0);
    const y = luminance(r, g, b);
    luma.push(y);
    rTotal += r;
    gTotal += g;
    bTotal += b;
    if (y <= 8) dark += 1;
    if (y >= 247) bright += 1;
    opaque += 1;

    const x = pixel % width;
    if (x + 1 < width) {
      const neighbor = offset + 4;
      if (Number(data[neighbor + 3] ?? 255) >= 64) {
        const neighborY = luminance(data[neighbor], data[neighbor + 1], data[neighbor + 2]);
        edgeTotal += Math.abs(y - neighborY);
        edgeCount += 1;
      }
    }
  }

  luma.sort((a, b) => a - b);
  const count = Math.max(1, opaque);
  const channelMeans = { r: rTotal / count, g: gTotal / count, b: bTotal / count };
  const channelValues = Object.values(channelMeans);
  return {
    sampled_pixels: opaque,
    dark_clip_ratio: dark / count,
    bright_clip_ratio: bright / count,
    luma_p05: percentile(luma, 0.05),
    luma_p50: percentile(luma, 0.5),
    luma_p95: percentile(luma, 0.95),
    dynamic_range: percentile(luma, 0.95) - percentile(luma, 0.05),
    edge_energy: edgeCount ? edgeTotal / edgeCount : 0,
    channel_means: channelMeans,
    global_channel_spread: Math.max(...channelValues) - Math.min(...channelValues),
  };
}
export function evaluateCaptureQualityV1({ decodedImage = null, regions = [], metadata = {} } = {}) {
  const width = Number(decodedImage?.width || metadata?.width || 0);
  const height = Number(decodedImage?.height || metadata?.height || 0);
  const megapixels = width > 0 && height > 0 ? (width * height) / 1_000_000 : 0;
  if (!validImage(decodedImage)) {
    return {
      version: VERSION,
      available: false,
      score: 0,
      disposition: "retake",
      publication_recommendation: "withhold_intrinsic_color",
      issues: [issue("invalid_or_missing_decoded_image", "blocking", null, "Upload a supported, fully decoded image.")],
      measurements: { width, height, megapixels: round(megapixels) },
      guidance: ["Upload a supported JPEG or PNG image and try again."],
    };
  }

  const measurements = sampleImage(decodedImage);
  const issues = [];
  if (Math.min(width, height) < 320 || megapixels < 0.2) {
    issues.push(issue("insufficient_resolution", "blocking", { width, height, megapixels: round(megapixels) }, "Move closer or use a higher-resolution photograph."));
  }
  if (measurements.bright_clip_ratio > 0.22) {
    issues.push(issue("severe_highlight_clipping", "blocking", round(measurements.bright_clip_ratio), "Reduce exposure and avoid direct glare."));
  } else if (measurements.bright_clip_ratio > 0.08) {
    issues.push(issue("highlight_clipping", "warning", round(measurements.bright_clip_ratio), "Reduce direct light or glare."));
  }
  if (measurements.dark_clip_ratio > 0.32) {
    issues.push(issue("severe_shadow_clipping", "blocking", round(measurements.dark_clip_ratio), "Increase soft, neutral illumination."));
  } else if (measurements.dark_clip_ratio > 0.12) {
    issues.push(issue("shadow_clipping", "warning", round(measurements.dark_clip_ratio), "Add soft light so garment detail remains visible."));
  }
  if (measurements.dynamic_range < 22) {
    issues.push(issue("low_tonal_information", "warning", round(measurements.dynamic_range, 2), "Retake with clearer separation between garment details and lighting."));
  }
  if (measurements.edge_energy < 1.4 && measurements.dynamic_range > 22) {
    issues.push(issue("possible_blur", "warning", round(measurements.edge_energy, 2), "Hold the camera steady and ensure garment edges are sharp."));
  }
  if (measurements.global_channel_spread > 48) {
    issues.push(issue("possible_global_color_cast", "warning", round(measurements.global_channel_spread, 2), "Use neutral white light or include a neutral reference card."));
  }
  if (!Array.isArray(regions) || regions.length === 0) {
    issues.push(issue("no_object_regions_detected", "warning", 0, "Keep the full outfit visible against a contrasting background."));
  }
  if (metadata?.edited_or_filtered === true) {
    issues.push(issue("declared_filter_or_edit", "blocking", true, "Use the original, unfiltered photograph."));
  }

  const blocking = issues.filter((entry) => entry.severity === "blocking");
  const warnings = issues.filter((entry) => entry.severity === "warning");
  const score = clamp01(1 - (blocking.length * 0.36) - (warnings.length * 0.09));
  const disposition = blocking.length ? "retake" : warnings.length ? "review" : "accept";
  return {
    version: VERSION,
    available: true,
    score: round(score),
    disposition,
    publication_recommendation: disposition === "retake" ? "withhold_intrinsic_color" : disposition === "review" ? "publish_with_capture_warning" : "capture_supported",
    issues,
    measurements: {
      width,
      height,
      megapixels: round(megapixels),
      ...Object.fromEntries(Object.entries(measurements).map(([key, value]) => [key, typeof value === "number" ? round(value) : value])),
    },
    guidance: [...new Set(issues.map((entry) => entry.guidance).filter(Boolean))],
    policy: {
      global_color_cast_is_warning_not_proof: true,
      poor_capture_cannot_support_intrinsic_color: true,
      retake_is_preferred_to_unsupported_correction: true,
      captured_and_estimated_color_must_remain_distinct: true,
    },
  };
}
