/**
 * Presentation helpers for Garment Zones color labels.
 *
 * These helpers are intentionally UI-only: they preserve VisionCore color names
 * as the primary label and expose everyday color_identity.translation text as a
 * secondary display value without using it for any decision logic.
 */

export function normalizeColorPercentage(value) {
  if (value === null || value === undefined || value === "") return null;

  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;

  const ratio = numeric > 1 ? numeric / 100 : numeric;
  const percent = Math.max(0, Math.min(100, Math.round(ratio * 100)));
  return `${percent}%`;
}

export function traceZero(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "string" && value.trim().toLowerCase() === "trace") return "Trace";

  const numeric = Number.parseFloat(String(value).replace("%", ""));
  if (!Number.isFinite(numeric)) return null;
  return numeric === 0 ? "Trace" : null;
}

export function formatDetectedColorPercentage(color = {}) {
  const rawValue = color?.percentage ?? color?.display_pct ?? color?.pct ?? color?.ratio;
  if (rawValue === null || rawValue === undefined || rawValue === "") return null;

  const trace = traceZero(rawValue);
  if (trace) return trace;

  const numeric = Number.parseFloat(String(rawValue).replace("%", ""));
  if (!Number.isFinite(numeric)) return null;

  if (typeof rawValue === "string" && rawValue.includes("%")) return rawValue.trim();

  const normalized = normalizeColorPercentage(numeric);
  return numeric > 0 && normalized === "0%" ? "Trace" : normalized;
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

export function buildGarmentColorDisplayRows(colors = [], role = null, { normalize = false } = {}) {
  const rows = (Array.isArray(colors) ? colors : [colors])
    .filter(Boolean)
    .map((color) => ({
      role,
      ...buildColorDisplayLabel(color),
      hex: color.hex || null,
      percentage: normalizeColorPercentage(color.percentage ?? color.pct ?? color.ratio),
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

function collectNestedRegionColors(regions = []) {
  return regions.flatMap((region) => {
    if (Array.isArray(region?.region_colors)) return region.region_colors;
    if (Array.isArray(region?.colors)) return region.colors;
    if (Array.isArray(region?.colorBreakdown)) return region.colorBreakdown;
    if (Array.isArray(region?.colorBreakdown?.colors)) return region.colorBreakdown.colors;
    if (Array.isArray(region?.colorBreakdown?.region_colors)) return region.colorBreakdown.region_colors;
    return [];
  });
}

function readDetectedColorSource(zone = {}) {
  if (Array.isArray(zone?.detectedPalette) && zone.detectedPalette.length) return zone.detectedPalette;
  if (Array.isArray(zone?.detected_palette) && zone.detected_palette.length) return zone.detected_palette;

  const segmentedRegionColors = collectNestedRegionColors(zone?.segmented_regions || zone?.regions || []);
  if (segmentedRegionColors.length) return segmentedRegionColors;

  if (Array.isArray(zone?.region_colors) && zone.region_colors.length) return zone.region_colors;
  if (Array.isArray(zone?.colorBreakdown)) return zone.colorBreakdown;
  if (Array.isArray(zone?.colorBreakdown?.colors)) return zone.colorBreakdown.colors;
  if (Array.isArray(zone?.colorBreakdown?.region_colors)) return zone.colorBreakdown.region_colors;

  return [];
}

export function collectDetectedRegionColors(zone = {}) {
  return readDetectedColorSource(zone).filter(Boolean);
}

export function buildDetectedPaletteDisplay(zone = {}) {
  return collectDetectedRegionColors(zone).map((color) => ({
    ...buildColorDisplayLabel(color),
    hex: color.hex || color.base || null,
    percentage: formatDetectedColorPercentage(color),
    compact: true,
    muted: true,
    rawColor: color,
  }));
}

export function buildDetectedColorDisplayRows(zone = {}) {
  return buildDetectedPaletteDisplay(zone);
}

function buildColorCardSwatch(color, role = null) {
  if (!color) return null;
  return {
    role,
    ...buildColorDisplayLabel(color),
    hex: color.hex || color.base || null,
    percentage: formatDetectedColorPercentage(color),
    reason: typeof color.reason === "string" && color.reason.trim() ? color.reason.trim() : null,
    rawColor: color,
  };
}

export function buildVisionCoreColorCardSections(zone = {}) {
  const sections = [];
  const dominant = buildColorCardSwatch(zone.dominant_color, "Dominant");
  const primary = buildColorCardSwatch(zone.primary_color, "Primary");

  if (dominant || primary) {
    sections.push({
      key: "identity",
      hierarchy: 1,
      title: "Color Identity",
      variant: "primary",
      rows: [
        dominant && { label: "Dominant Color", hierarchy: 1, ...dominant },
        primary && { label: "Primary Color", hierarchy: 2, ...primary },
      ].filter(Boolean),
    });
  }

  const signature = buildColorCardSwatch(zone.signature_color, "Signature");
  if (signature) {
    sections.push({
      key: "signature_color",
      hierarchy: 3,
      title: "Signature Color",
      variant: "interpretation",
      rows: [signature],
      reason: signature.reason,
    });
  }

  const secondary = buildGarmentColorDisplayRows(zone.secondary_colors, "Secondary");
  if (secondary.length) {
    sections.push({ key: "secondary_colors", hierarchy: 4, title: "Secondary Colors", variant: "interpretation", rows: secondary });
  }

  const accents = buildGarmentColorDisplayRows(zone.accent_colors, "Accent");
  if (accents.length) {
    sections.push({ key: "accent_colors", hierarchy: 5, title: "Accent Colors", variant: "interpretation", rows: accents });
  }

  const detected = buildDetectedColorDisplayRows(zone);
  if (detected.length) {
    sections.push({ key: "detected_colors", hierarchy: 6, title: "Detected Palette", variant: "evidence", muted: true, compact: true, rows: detected });
  }

  return sections;
}
export function buildGarmentZoneColorDisplay(zone = {}) {
  const colorMode = zone.color_mode || zone.colorMode || null;

  if (colorMode === "single_color") {
    return {
      mode: "single_color",
      colors: [buildSingleColorZoneDisplay(zone.primary_color || zone.dominant_color, colorMode)].filter(Boolean),
      palette: buildRegionPaletteDisplay(zone.region_colors),
      detected_colors: buildDetectedColorDisplayRows(zone),
      detectedPalette: buildDetectedPaletteDisplay(zone),
      card_sections: buildVisionCoreColorCardSections(zone),
    };
  }

  return {
    mode: colorMode || "multicolor",
    colors: buildMulticolorZoneDisplay(zone),
    palette: buildRegionPaletteDisplay(zone.region_colors),
    detected_colors: buildDetectedColorDisplayRows(zone),
    detectedPalette: buildDetectedPaletteDisplay(zone),
    card_sections: buildVisionCoreColorCardSections(zone),
  };
}
