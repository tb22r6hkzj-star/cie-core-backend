/**
 * Presentation helpers for Garment Zones color labels.
 *
 * These helpers are intentionally UI-only: they preserve VisionCore color names
 * as the primary label and expose everyday color_identity.translation text as a
 * secondary display value without using it for any decision logic.
 */

export function normalizeColorPercentage(value, { traceZero = false } = {}) {
  if (value === null || value === undefined || value === "") return null;

  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  if (traceZero && numeric <= 0) return "Trace";

  const ratio = numeric > 1 ? numeric / 100 : numeric;
  const percent = Math.max(0, Math.min(100, Math.round(ratio * 100)));
  return traceZero && percent === 0 ? "Trace" : `${percent}%`;
}

export function getColorIdentityTranslation(color) {
  const translation = color?.color_identity?.translation;
  return typeof translation === "string" && translation.trim() ? translation.trim() : null;
}

export function buildColorDisplayLabel(color) {
  const primaryLabel = color?.name || color?.color_identity?.name || color?.hex || "Unknown";
  return {
    primaryLabel,
    translation: getColorIdentityTranslation(color),
  };
}

function readColorRatio(color = {}) {
  const value = color?.display_pct ?? color?.pct ?? color?.ratio ?? color?.percentage;
  if (value === null || value === undefined || value === "") return 0;

  const numeric = Number.parseFloat(String(value).replace("%", ""));
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return numeric > 1 ? numeric / 100 : numeric;
}

function mergeDisplayColorFamilies(rows = []) {
  const groups = new Map();
  for (const row of rows) {
    const key = String(row.primaryLabel || row.hex || "unknown").trim().toLowerCase();
    const ratio = readColorRatio(row.rawColor);
    const existing = groups.get(key);
    if (existing) {
      existing._displayRatio += ratio;
      if (ratio > existing._topRatio) {
        existing.hex = row.hex;
        existing.translation = row.translation;
        existing.rawColor = row.rawColor;
        existing._topRatio = ratio;
      }
      continue;
    }
    groups.set(key, { ...row, _displayRatio: ratio, _topRatio: ratio });
  }
  return Array.from(groups.values());
}

function normalizeDisplayPaletteRows(rows = []) {
  const mergedRows = mergeDisplayColorFamilies(rows);
  const totalRatio = mergedRows.reduce((sum, row) => sum + Number(row._displayRatio || 0), 0);
  return mergedRows
    .map(({ _displayRatio, _topRatio, ...row }) => ({
      ...row,
      percentage: totalRatio > 0 ? normalizeColorPercentage(_displayRatio / totalRatio) : null,
      display_pct: totalRatio > 0 ? _displayRatio / totalRatio : null,
    }))
    .sort((a, b) => Number(b.display_pct || 0) - Number(a.display_pct || 0));
}

export function buildGarmentColorDisplayRows(colors = [], role = null, { normalize = false, traceZero = false } = {}) {
  const rows = (Array.isArray(colors) ? colors : [colors])
    .filter(Boolean)
    .map((color) => ({
      role,
      ...buildColorDisplayLabel(color),
      hex: color.hex || null,
      percentage: normalizeColorPercentage(color.percentage ?? color.pct ?? color.ratio, { traceZero }),
      rawColor: color,
    }));
  return normalize ? normalizeDisplayPaletteRows(rows) : rows;
}

export function buildSingleColorZoneDisplay(color, colorMode = "single_color") {
  if (!color) return null;

  return {
    ...buildColorDisplayLabel(color),
    hex: color.hex || null,
    colorMode,
  };
}

export function buildMulticolorZoneDisplay({ dominant_color, primary_color, secondary_colors, support_colors, accent_colors } = {}) {
  const primary = primary_color || dominant_color;
  const secondary = Array.isArray(secondary_colors) && secondary_colors.length ? secondary_colors : support_colors;

  return normalizeDisplayPaletteRows([
    ...buildGarmentColorDisplayRows(primary, "Primary"),
    ...buildGarmentColorDisplayRows(secondary, "Secondary"),
    ...buildGarmentColorDisplayRows(accent_colors, "Accent"),
  ]);
}

export function buildRegionPaletteDisplay(region_colors = []) {
  return buildGarmentColorDisplayRows(region_colors, null, { normalize: true });
}

function collectDetectedRegionColors(zone = {}) {
  if (Array.isArray(zone.region_colors) && zone.region_colors.length) return zone.region_colors;

  const regions = Array.isArray(zone.segmented_regions) ? zone.segmented_regions : [];
  const zoneKey = zone.zone || zone.zone_key || zone.segment_label || zone.category || null;
  const matchingRegion = regions.find((region) => {
    if (!Array.isArray(region?.region_colors) || !region.region_colors.length) return false;
    if (!zoneKey) return true;
    return [region.zone, region.zone_key, region.segment_label, region.category, region.label]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase() === String(zoneKey).toLowerCase());
  }) || regions.find((region) => Array.isArray(region?.region_colors) && region.region_colors.length);

  return Array.isArray(matchingRegion?.region_colors) ? matchingRegion.region_colors : [];
}

export function buildDetectedPaletteDisplay(zone = {}) {
  const regionColors = collectDetectedRegionColors(zone);
  return {
    title: "Detected Palette",
    colors: buildGarmentColorDisplayRows(regionColors, null, { traceZero: true }),
    source: regionColors.length ? "region_colors" : null,
  };
}
export function buildGarmentZoneColorDisplay(zone = {}) {
  const colorMode = zone.color_mode || zone.colorMode || null;

  if (colorMode === "single_color") {
    return {
      mode: "single_color",
      colors: [buildSingleColorZoneDisplay(zone.primary_color || zone.dominant_color, colorMode)].filter(Boolean),
      palette: buildRegionPaletteDisplay(zone.region_colors),
      detectedPalette: buildDetectedPaletteDisplay(zone),
    };
  }

  return {
    mode: colorMode || "multicolor",
    colors: buildMulticolorZoneDisplay(zone),
    palette: buildRegionPaletteDisplay(zone.region_colors),
    detectedPalette: buildDetectedPaletteDisplay(zone),
  };
}
