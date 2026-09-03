const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));

function parseHex(value) {
  const match = String(value || "").trim().match(/^#?([0-9a-f]{6})$/i);
  if (!match) return null;
  const token = match[1];
  return [0, 2, 4].map((offset) => Number.parseInt(token.slice(offset, offset + 2), 16));
}

function safeHex(value) {
  const match = String(value || "").trim().match(/^#?([0-9a-f]{6})$/i);
  return match ? `#${match[1].toUpperCase()}` : null;
}

function rgbTraits(rgb) {
  const [r8, g8, b8] = rgb;
  const r = r8 / 255, g = g8 / 255, b = b8 / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const delta = max - min;
  const lightness = (max + min) / 2;
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));
  let hue = 0;
  if (delta > 0) {
    if (max === r) hue = 60 * (((g - b) / delta) % 6);
    else if (max === g) hue = 60 * ((b - r) / delta + 2);
    else hue = 60 * ((r - g) / delta + 4);
  }
  if (hue < 0) hue += 360;
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return { hue, saturation, lightness, luminance, r: r8, g: g8, b: b8 };
}

function normalizedWeights(colors = []) {
  const rows = colors.map((color) => ({ color, rgb: parseHex(color?.hex), weight: clamp01(color?.pct) })).filter((row) => row.rgb);
  const total = rows.reduce((sum, row) => sum + row.weight, 0) || rows.length || 1;
  return rows.map((row) => ({ ...row, weight: row.weight ? row.weight / total : 1 / total, traits: rgbTraits(row.rgb) }));
}

function isWarmMetalRow(row) {
  const { hue, saturation, lightness, r, g, b } = row?.traits || {};
  return hue >= 24 && hue <= 62 && saturation >= 0.16 && lightness >= 0.20 && lightness <= 0.90 && r >= g && g > b;
}

function representativeMetalRow(rows = []) {
  const warmRows = rows.filter(isWarmMetalRow);
  if (!warmRows.length) return null;

  const sortedLuminance = warmRows.map((row) => row.traits.luminance).sort((a, b) => a - b);
  const medianLuminance = sortedLuminance[Math.floor(sortedLuminance.length / 2)] ?? 0.5;

  return [...warmRows].sort((a, b) => {
    const score = (row) => {
      const luminanceDistance = Math.abs(row.traits.luminance - medianLuminance);
      const highlightPenalty = Math.max(0, row.traits.lightness - 0.76) * 2.5;
      const shadowPenalty = Math.max(0, 0.28 - row.traits.lightness) * 1.8;
      return row.weight * 1.4 + row.traits.saturation * 0.35 - luminanceDistance - highlightPenalty - shadowPenalty;
    };
    return score(b) - score(a);
  })[0] || null;
}

/**
 * Classifies a metallic color family from VisionCore-owned object pixels.
 * It deliberately refuses to infer gold from an external semantic label.
 */
export function classifyMeasuredMetallicPaletteV1({ colors = [], highlightRatio = 0, validationSupported = false } = {}) {
  const rows = normalizedWeights(colors);
  if (!validationSupported || rows.length < 2) {
    return { publishable: false, family: null, display_name: null, confidence: 0, representative_hex: null, reason: "insufficient_validated_metallic_pixels" };
  }

  const warmShare = rows.reduce((sum, row) => sum + (isWarmMetalRow(row) ? row.weight : 0), 0);
  const luminances = rows.map((row) => row.traits.luminance);
  const luminanceSpread = Math.max(...luminances) - Math.min(...luminances);
  const reflectiveStructure = luminanceSpread >= 0.16 || (highlightRatio >= 0.015 && highlightRatio <= 0.68);
  const confidence = clamp01(warmShare * 0.72 + Math.min(1, luminanceSpread / 0.28) * 0.20 + (reflectiveStructure ? 0.08 : 0));
  const publishable = warmShare >= 0.58 && reflectiveStructure && confidence >= 0.62;
  const representative = publishable ? representativeMetalRow(rows) : null;

  return {
    publishable,
    family: publishable ? "gold_tone_metal" : null,
    display_name: publishable ? "Gold Tone" : null,
    confidence,
    representative_hex: representative ? safeHex(representative.color?.hex) : null,
    reason: publishable ? "validated_warm_metal_reflectance" : "metallic_family_not_sufficiently_supported",
    evidence: {
      warm_pixel_share: warmShare,
      luminance_spread: luminanceSpread,
      highlight_ratio: clamp01(highlightRatio),
      representative_source: representative ? "measured_mid_tone_metallic_pixel_cluster" : null,
    },
  };
}
