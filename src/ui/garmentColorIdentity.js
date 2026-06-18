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

export function buildGarmentColorDisplayRows(colors = [], role = null) {
  return (Array.isArray(colors) ? colors : [colors])
    .filter(Boolean)
    .map((color) => ({
      role,
      ...buildColorDisplayLabel(color),
      hex: color.hex || null,
      percentage: normalizeColorPercentage(color.percentage ?? color.pct ?? color.ratio),
      rawColor: color,
    }));
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

  return [
    ...buildGarmentColorDisplayRows(primary, "Primary"),
    ...buildGarmentColorDisplayRows(secondary, "Secondary"),
    ...buildGarmentColorDisplayRows(accent_colors, "Accent"),
  ];
}

export function buildRegionPaletteDisplay(region_colors = []) {
  return buildGarmentColorDisplayRows(region_colors, null);
}
export function buildGarmentZoneColorDisplay(zone = {}) {
  const colorMode = zone.color_mode || zone.colorMode || null;

  if (colorMode === "single_color") {
    return {
      mode: "single_color",
      colors: [buildSingleColorZoneDisplay(zone.primary_color || zone.dominant_color, colorMode)].filter(Boolean),
      palette: buildRegionPaletteDisplay(zone.region_colors),
    };
  }

  return {
    mode: colorMode || "multicolor",
    colors: buildMulticolorZoneDisplay(zone),
    palette: buildRegionPaletteDisplay(zone.region_colors),
  };
}
