import chroma from "chroma-js";

function safeHex(value) {
  try { return chroma(value).hex().toUpperCase(); } catch { return null; }
}

function familyOf(hex) {
  const [lightness, a, b] = chroma(hex).lab();
  const magnitude = Math.sqrt(a * a + b * b);
  if (magnitude < 14) return lightness >= 85 ? "white" : lightness < 32 ? "black" : "gray";
  const [rawHue] = chroma(hex).hsl();
  const hue = Number.isFinite(rawHue) ? rawHue : 0;
  if (hue >= 345 || hue < 15) return "red";
  if (hue >= 315) return "pink";
  if (hue < 55) return "earth";
  if (hue < 80) return "yellow";
  if (hue < 170) return "green";
  if (hue < 205) return "teal";
  if (hue < 255) return "blue";
  if (hue < 315) return "purple";
  return "other";
}

export function aggregateMeasuredMaskColorsV1(colors = [], limit = 6) {
  const groups = [];
  for (const color of Array.isArray(colors) ? colors : []) {
    const hex = safeHex(color?.hex || "");
    const pixels = Math.max(0, Number(color?.pixel_count || 0));
    if (!hex || !pixels) continue;
    const family = familyOf(hex);
    const spatialCells = new Set(Array.isArray(color?.spatial_cells) ? color.spatial_cells.map(String) : []);
    const match = groups.find((group) => (
      group.family === family && chroma.distance(group.hex, hex, "lab") < 20
    ));
    if (!match) {
      groups.push({ ...color, hex, family, pixel_count: pixels, representative_pixel_count: pixels, _spatial_cells: spatialCells });
      continue;
    }
    match.pixel_count += pixels;
    for (const cell of spatialCells) match._spatial_cells.add(cell);
    if (pixels > match.representative_pixel_count) {
      match.hex = hex;
      match.representative_pixel_count = pixels;
    }
  }
  const total = groups.reduce((sum, group) => sum + group.pixel_count, 0) || 1;
  return groups
    .map(({ representative_pixel_count: _representativePixelCount, _spatial_cells: spatialCells, ...group }) => {
      const cellCount = Math.max(1, Number(group?.spatial_grid_cell_count || 64));
      const spatialCellCount = spatialCells.size;
      const pct = group.pixel_count / total;
      const spatialCellRatio = spatialCellCount / cellCount;
      return {
        ...group,
        pct,
        total_owned_pixel_count: total,
        spatial_cells: [...spatialCells].sort(),
        spatial_cell_count: spatialCellCount,
        spatial_grid_cell_count: cellCount,
        spatial_cell_ratio: spatialCellRatio,
        // A real garment motif can have modest pixel mass while repeating over
        // the entire piece. Preserve that evidence independently from share.
        pattern_repetition_supported: pct >= 0.025 && spatialCellCount >= 4 && spatialCellRatio >= 0.08,
      };
    })
    .sort((a, b) => b.pixel_count - a.pixel_count)
    .slice(0, Math.max(1, Number(limit) || 6));
}
