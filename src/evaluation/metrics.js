function clamp01(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
}

function normalizeHex(hex) {
  const value = String(hex || "").trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(value)) return `#${value.split("").map((c) => c + c).join("")}`.toUpperCase();
  if (/^[0-9a-f]{6}$/i.test(value)) return `#${value}`.toUpperCase();
  return null;
}

function hexToRgb(hex) {
  const normalized = normalizeHex(hex);
  if (!normalized) return null;
  return {
    r: parseInt(normalized.slice(1, 3), 16) / 255,
    g: parseInt(normalized.slice(3, 5), 16) / 255,
    b: parseInt(normalized.slice(5, 7), 16) / 255,
  };
}

function rgbToLab(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const linear = (v) => (v > 0.04045 ? ((v + 0.055) / 1.055) ** 2.4 : v / 12.92);
  const r = linear(rgb.r);
  const g = linear(rgb.g);
  const b = linear(rgb.b);
  const x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
  const y = r * 0.2126 + g * 0.7152 + b * 0.0722;
  const z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
  const pivot = (v) => (v > 0.008856 ? Math.cbrt(v) : (7.787 * v) + (16 / 116));
  const fx = pivot(x);
  const fy = pivot(y);
  const fz = pivot(z);
  return { l: (116 * fy) - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

export function labColorDistance(a, b) {
  const left = rgbToLab(typeof a === "string" ? a : a?.hex);
  const right = rgbToLab(typeof b === "string" ? b : b?.hex);
  if (!left || !right) return null;
  return Math.sqrt((left.l - right.l) ** 2 + (left.a - right.a) ** 2 + (left.b - right.b) ** 2);
}

export function objectPrecisionRecall(expected = [], predicted = []) {
  const expectedSet = new Set((expected || []).map((v) => String(v).toLowerCase()));
  const predictedSet = new Set((predicted || []).map((v) => String(v).toLowerCase()));
  let tp = 0;
  for (const item of predictedSet) if (expectedSet.has(item)) tp += 1;
  const precision = predictedSet.size ? tp / predictedSet.size : expectedSet.size ? 0 : 1;
  const recall = expectedSet.size ? tp / expectedSet.size : predictedSet.size ? 0 : 1;
  return { precision, recall, true_positives: tp, expected_count: expectedSet.size, predicted_count: predictedSet.size };
}

export function colorAccuracy(expected = [], predicted = [], threshold = 20) {
  const expectedColors = (expected || []).map((c) => typeof c === "string" ? c : c?.hex).filter(Boolean);
  const predictedColors = (predicted || []).map((c) => typeof c === "string" ? c : c?.hex).filter(Boolean);
  if (!expectedColors.length) return predictedColors.length ? 0 : 1;
  let matches = 0;
  for (const expectedHex of expectedColors) {
    const best = predictedColors.reduce((min, candidate) => {
      const distance = labColorDistance(expectedHex, candidate);
      return distance === null ? min : Math.min(min, distance);
    }, Infinity);
    if (best <= threshold) matches += 1;
  }
  return matches / expectedColors.length;
}

export function confidenceError(predicted, expectedRange = [0, 1]) {
  const p = clamp01(Number(predicted) > 1 ? Number(predicted) / 100 : predicted);
  const low = clamp01(expectedRange?.[0]);
  const high = clamp01(expectedRange?.[1] ?? 1);
  if (p < low) return low - p;
  if (p > high) return p - high;
  return 0;
}

export function confidenceBins(rows = [], binCount = 10) {
  const count = Math.max(1, Math.floor(binCount));
  const bins = Array.from({ length: count }, (_, index) => ({
    index,
    lower: index / count,
    upper: (index + 1) / count,
    count: 0,
    average_confidence: 0,
    average_accuracy: 0,
  }));
  for (const row of rows || []) {
    const confidence = clamp01(row?.confidence);
    const accuracy = clamp01(row?.accuracy);
    const index = Math.min(count - 1, Math.floor(confidence * count));
    const bin = bins[index];
    bin.average_confidence = ((bin.average_confidence * bin.count) + confidence) / (bin.count + 1);
    bin.average_accuracy = ((bin.average_accuracy * bin.count) + accuracy) / (bin.count + 1);
    bin.count += 1;
  }
  return bins;
}

export function expectedCalibrationError(rows = [], binCount = 10) {
  const total = Math.max(1, (rows || []).length);
  return confidenceBins(rows, binCount).reduce((sum, bin) => sum + (bin.count / total) * Math.abs(bin.average_confidence - bin.average_accuracy), 0);
}

export function maximumCalibrationError(rows = [], binCount = 10) {
  return confidenceBins(rows, binCount).reduce((max, bin) => bin.count ? Math.max(max, Math.abs(bin.average_confidence - bin.average_accuracy)) : max, 0);
}

export function brierScore(rows = []) {
  if (!(rows || []).length) return 0;
  return rows.reduce((sum, row) => sum + (clamp01(row?.confidence) - clamp01(row?.accuracy)) ** 2, 0) / rows.length;
}
