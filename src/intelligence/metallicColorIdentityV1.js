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

function isSilverMetalRow(row) {
  const { saturation, lightness, r, g, b } = row?.traits || {};
  const channelSpread = Math.max(r, g, b) - Math.min(r, g, b);
  return saturation <= 0.18 && channelSpread <= 34 && lightness >= 0.08 && lightness <= 0.96;
}

function representativeMetalRow(rows = []) {
  const warmRows = rows.filter(isWarmMetalRow);
  if (!warmRows.length) return null;

  const byLuminance = [...warmRows].sort((a, b) => a.traits.luminance - b.traits.luminance);
  const medianLuminance = byLuminance[Math.floor((byLuminance.length - 1) / 2)]?.traits?.luminance ?? 0.5;
  const brightest = byLuminance[byLuminance.length - 1] || null;
  const brightestLooksSpecular =
    warmRows.length >= 3 &&
    brightest &&
    brightest.traits.lightness >= 0.70 &&
    brightest.traits.luminance - medianLuminance >= 0.10;

  const candidates = brightestLooksSpecular
    ? warmRows.filter((row) => row !== brightest)
    : warmRows;

  return [...candidates].sort((a, b) => {
    const score = (row) => {
      const luminanceDistance = Math.abs(row.traits.luminance - medianLuminance);
      const shadowPenalty = Math.max(0, 0.28 - row.traits.lightness) * 1.8;
      return row.weight * 1.1 + row.traits.saturation * 0.35 - luminanceDistance - shadowPenalty;
    };
    return score(b) - score(a);
  })[0] || null;
}

function representativeSilverRow(rows = []) {
  const candidates = rows.filter((row) => isSilverMetalRow(row) && row.traits.lightness >= 0.30);
  if (!candidates.length) return null;
  return [...candidates].sort((a, b) => {
    const score = (row) => row.weight * 1.2 - Math.abs(row.traits.lightness - 0.62) * 0.35;
    return score(b) - score(a);
  })[0] || null;
}

/**
 * Classifies a metallic color family from VisionCore-owned object pixels.
 * It deliberately refuses to infer gold from an external semantic label.
 */
export function classifyMeasuredMetallicPaletteV1({ colors = [], highlightRatio = 0, validationSupported = false } = {}) {
  const rows = normalizedWeights(colors);
  if (!validationSupported || rows.length < 1) {
    return { publishable: false, family: null, display_name: null, confidence: 0, representative_hex: null, reason: "insufficient_validated_metallic_pixels" };
  }

  const warmShare = rows.reduce((sum, row) => sum + (isWarmMetalRow(row) ? row.weight : 0), 0);
  const silverShare = rows.reduce((sum, row) => sum + (isSilverMetalRow(row) ? row.weight : 0), 0);
  const luminances = rows.map((row) => row.traits.luminance);
  const luminanceSpread = Math.max(...luminances) - Math.min(...luminances);
  const reflectiveStructure = luminanceSpread >= 0.16 || (highlightRatio >= 0.015 && highlightRatio <= 0.68);
  const goldConfidence = clamp01(warmShare * 0.72 + Math.min(1, luminanceSpread / 0.28) * 0.20 + (reflectiveStructure ? 0.08 : 0));
  const silverConfidence = clamp01(silverShare * 0.70 + Math.min(1, luminanceSpread / 0.28) * 0.16 + (reflectiveStructure ? 0.14 : 0));
  const goldPublishable = warmShare >= 0.58 && reflectiveStructure && goldConfidence >= 0.62;
  const silverPublishable = !goldPublishable && silverShare >= 0.58 && reflectiveStructure && silverConfidence >= 0.62;
  const publishable = goldPublishable || silverPublishable;
  const family = goldPublishable ? "gold_tone_metal" : silverPublishable ? "silver_tone_metal" : null;
  const displayName = goldPublishable ? "Gold Tone" : silverPublishable ? "Silver/Diamond Tone" : null;
  const confidence = goldPublishable ? goldConfidence : silverConfidence;
  const representative = goldPublishable
    ? representativeMetalRow(rows)
    : silverPublishable
      ? representativeSilverRow(rows)
      : null;

  return {
    publishable,
    family,
    display_name: displayName,
    confidence,
    representative_hex: representative ? safeHex(representative.color?.hex) : null,
    reason: goldPublishable
      ? "validated_warm_metal_reflectance"
      : silverPublishable
        ? "validated_neutral_metal_reflectance"
        : "metallic_family_not_sufficiently_supported",
    evidence: {
      warm_pixel_share: warmShare,
      neutral_silver_pixel_share: silverShare,
      luminance_spread: luminanceSpread,
      highlight_ratio: clamp01(highlightRatio),
      representative_source: representative ? "measured_mid_tone_metallic_pixel_cluster" : null,
      specular_highlight_excluded_from_representative: Boolean(
        rows.length >= 2 &&
        rows.some((row) => row !== representative && row.traits.lightness >= 0.70)
      ),
    },
  };
}
