from pathlib import Path

path = Path('src/server.js')
text = path.read_text()

anchor = '''function splitAccessoryDetectedPaletteRoles(detectedPalette = []) {
  const rows = Array.isArray(detectedPalette) ? detectedPalette : [];
  return {
    primary: rows[0] ? compactColorRead(rows[0]) : null,
    secondary: rows.slice(1).filter((color) => normalizeColorPct(color?.pct) > 0).map(compactColorRead).filter(Boolean),
    accent: rows.slice(1).filter((color) => normalizeColorPct(color?.pct) <= 0).map(compactColorRead).filter(Boolean),
  };
}
'''

helpers = anchor + '''
function isAccessoryDisplayPaletteZone(zoneKey) {
  return ["accessory_jewelry", "bag", "belt", "eyewear", "headwear"].includes(zoneKey);
}

function isBrownFamilyHex(hex) {
  const safe = safeHex(hex);
  if (!safe) return false;
  const hue = getHue(safe);
  const sat = getSat(safe);
  const light = getLight(safe);
  return hue >= 8 && hue <= 55 && sat >= 0.22 && light >= 0.08 && light <= 0.62;
}

function preserveAccessoryRawPalette(colors = []) {
  return (Array.isArray(colors) ? colors : [])
    .map((color) => {
      const hex = safeHex(color?.hex || color?.base);
      if (!hex) return null;
      return {
        ...color,
        hex,
        name: getAccessoryDetectedColorName({ ...color, hex }),
        pct: color?.pct,
      };
    })
    .filter(Boolean);
}

function accessoryPaletteContaminationReason(color = {}) {
  const hex = safeHex(color?.hex || color?.base);
  if (!hex) return "invalid_hex";
  const pct = normalizeColorPct(color?.pct);
  if (pct <= 0) return null;
  if (isBrownFamilyHex(hex)) return null;
  const hue = getHue(hex);
  const sat = getSat(hex);
  const light = getLight(hex);
  if (light >= 0.86 && sat <= 0.2) return "highlight_or_glare";
  if (hue >= 8 && hue <= 55 && sat >= 0.12 && sat <= 0.55 && light >= 0.48 && light <= 0.86) {
    return "skin_or_beige_contamination";
  }
  return null;
}

function filterAccessoryDisplayPalette(colors = []) {
  const kept = [];
  const rejected = [];
  for (const color of buildAccessoryDinoDetectedPalette(colors)) {
    const reason = accessoryPaletteContaminationReason(color);
    if (reason) rejected.push({ hex: color.hex, pct: color.pct, reason });
    else kept.push(color);
  }
  return { kept, rejected };
}

function selectAccessoryDisplayPalette({ refinedCrop = [], candidateRegion = [], rawDino = [], detector = [], fallback = [] } = {}) {
  const sources = [
    ["refined_crop", refinedCrop],
    ["candidate_region", candidateRegion],
    ["raw_dino", rawDino],
    ["detector", detector],
    ["fallback", fallback],
  ];
  const source_trace = [];
  for (const [source, colors] of sources) {
    const { kept, rejected } = filterAccessoryDisplayPalette(colors);
    source_trace.push({ source, input_count: Array.isArray(colors) ? colors.length : 0, surviving_count: kept.length, rejected });
    if (kept.length) {
      return {
        palette: kept,
        selected_source: source,
        trace: {
          selected_source: source,
          precedence: ["refined_crop", "candidate_region", "raw_dino", "detector", "fallback"],
          reason_not_replaced: "higher_priority_confirmed_values_are_authoritative",
          sources: source_trace,
        },
      };
    }
  }
  return {
    palette: [],
    selected_source: null,
    trace: {
      selected_source: null,
      precedence: ["refined_crop", "candidate_region", "raw_dino", "detector", "fallback"],
      reason_not_replaced: "no_publishable_accessory_palette_survived",
      sources: source_trace,
    },
  };
}
'''

if anchor not in text:
    raise SystemExit('helper anchor not found')
text = text.replace(anchor, helpers, 1)

old_roles = '''  const primaryColorRead = compactColorRead(summaryPrimaryColor);
  const accessoryDetectedRoles = accessoryDinoDetectedPalette.length
    ? splitAccessoryDetectedPaletteRoles(accessoryDinoDetectedPalette)
    : null;
'''
new_roles = '''  const primaryColorRead = compactColorRead(summaryPrimaryColor);
  const rawDinoPalette = preserveAccessoryRawPalette(context?.rawDinoRegionColors || accessoryDinoRegionColors);
  const rawDetectorPalette = preserveAccessoryRawPalette(
    rawDinoPalette.length ? rawDinoPalette : (zoneData?.hex ? [{ hex: zoneData.hex, pct: zoneData.pct, name: zoneData.name }] : [])
  );
  const pixelRefinedPalette = preserveAccessoryRawPalette(context?.refinedRegionColors || []);
  const candidateRegionPalette = preserveAccessoryRawPalette(accessoryDinoRegionColors);
  const fallbackPalette = preserveAccessoryRawPalette(normalizedColors);
  const displayPaletteSelection = isAccessoryDisplayPaletteZone(zoneKey)
    ? selectAccessoryDisplayPalette({
        refinedCrop: pixelRefinedPalette,
        candidateRegion: candidateRegionPalette,
        rawDino: rawDinoPalette,
        detector: rawDetectorPalette,
        fallback: fallbackPalette,
      })
    : null;
  const displayPalette = displayPaletteSelection?.palette || [];
  const accessoryDisplayRoles = displayPalette.length
    ? splitAccessoryDetectedPaletteRoles(displayPalette)
    : null;
'''
if old_roles not in text:
    raise SystemExit('roles anchor not found')
text = text.replace(old_roles, new_roles, 1)

old_return = '''    primary_color: accessoryDetectedRoles?.primary || primaryColorRead,
    support_colors: supportColors,
    secondary_colors: accessoryDetectedRoles ? accessoryDetectedRoles.secondary : mergeColorReadSummaryFamilies(supportColors),
    accent_colors: accessoryDetectedRoles ? accessoryDetectedRoles.accent : mergeColorReadSummaryFamilies(accentColors),
    detected_colors: accessoryDinoDetectedPalette.length ? accessoryDinoDetectedPalette : summaryColorReadClusters,
    region_colors: accessoryDinoDetectedPalette.length ? accessoryDinoDetectedPalette : summaryColorReadClusters,
'''
new_return = '''    primary_color: accessoryDisplayRoles?.primary || primaryColorRead,
    support_colors: supportColors,
    secondary_colors: accessoryDisplayRoles ? accessoryDisplayRoles.secondary : mergeColorReadSummaryFamilies(supportColors),
    accent_colors: accessoryDisplayRoles ? accessoryDisplayRoles.accent : mergeColorReadSummaryFamilies(accentColors),
    detected_colors: displayPalette.length ? displayPalette : summaryColorReadClusters,
    region_colors: displayPalette.length ? displayPalette : summaryColorReadClusters,
    raw_detector_palette: isAccessoryDisplayPaletteZone(zoneKey) ? rawDetectorPalette : undefined,
    raw_dino_palette: isAccessoryDisplayPaletteZone(zoneKey) ? rawDinoPalette : undefined,
    pixel_refined_palette: isAccessoryDisplayPaletteZone(zoneKey) ? filterAccessoryDisplayPalette(pixelRefinedPalette).kept : undefined,
    display_palette: isAccessoryDisplayPaletteZone(zoneKey) ? displayPalette : undefined,
    display_palette_trace: isAccessoryDisplayPaletteZone(zoneKey) ? displayPaletteSelection?.trace : undefined,
'''
if old_return not in text:
    raise SystemExit('return anchor not found')
text = text.replace(old_return, new_return, 1)

old_region = '''    const dinoOnlyZone =
      zoneRegions.length > 0 &&
      zoneRegions.every((region) => isDinoSourceType(region?.source_type));
'''
new_region = '''    const refinedRegionColors = zoneRegions
      .filter((region) => !isDinoSourceType(region?.source_type))
      .flatMap((region) => Array.isArray(region?.region_colors) ? region.region_colors : []);
    const rawDinoRegionColors = zoneRegions
      .filter((region) => isDinoSourceType(region?.source_type))
      .flatMap((region) => Array.isArray(region?.region_colors) ? region.region_colors : []);
    const dinoOnlyZone =
      zoneRegions.length > 0 &&
      zoneRegions.every((region) => isDinoSourceType(region?.source_type));
'''
if old_region not in text:
    raise SystemExit('region anchor not found')
text = text.replace(old_region, new_region, 1)

old_context = '''        selectedDinoRegionColors: Array.isArray(dinoPrimaryRegion?.region_colors) ? dinoPrimaryRegion.region_colors : [],
        evidence,
'''
new_context = '''        selectedDinoRegionColors: Array.isArray(dinoPrimaryRegion?.region_colors) ? dinoPrimaryRegion.region_colors : [],
        refinedRegionColors,
        rawDinoRegionColors,
        evidence,
'''
if old_context not in text:
    raise SystemExit('context anchor not found')
text = text.replace(old_context, new_context, 1)

path.write_text(text)
