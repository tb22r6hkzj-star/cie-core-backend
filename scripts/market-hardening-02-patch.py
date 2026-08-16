from pathlib import Path

# --- V6 headwear contamination hardening ---
p = Path('src/intelligence/perceptionV6/index.js')
text = p.read_text()
old = '''  if (/hat|cap|beanie|headwear/.test(label)) {\n    if (r.dark > .72 && pixels.contrast < .06) contamination.push("hair_like_dark_region");\n    if (r.skin > .55) contamination.push("skin_dominance");\n    const supported = contamination.length === 0 && pixels.contrast >= .045 && r.highlight < .55;\n    return { supported, accepted: supported && entry.confidence >= .35, reason: supported ? "object_local_headwear_structure" : contamination[0] || "insufficient_headwear_pixel_contrast", contamination };\n  }\n'''
new = '''  if (/hat|cap|beanie|headwear/.test(label)) {\n    if (r.dark > .72 && pixels.contrast < .06) contamination.push("hair_like_dark_region");\n    if (r.skin > .55) contamination.push("skin_dominance");\n    const hairFaceBoundaryPattern = r.dark > .52 && r.skin >= .10 && r.object < .30;\n    if (hairFaceBoundaryPattern) contamination.push("hair_face_boundary_pattern");\n    const supported = contamination.length === 0 && pixels.contrast >= .045 && r.highlight < .55;\n    return { supported, accepted: supported && entry.confidence >= .35, reason: supported ? "object_local_headwear_structure" : contamination[0] || "insufficient_headwear_pixel_contrast", contamination };\n  }\n'''
if old not in text:
    raise SystemExit('headwear block not found')
text = text.replace(old, new, 1)
p.write_text(text)

# --- lower garment multi-window chromatic consensus ---
p = Path('src/server.js')
text = p.read_text()
old_sort = '''function sortLowerGarmentColors(colorRows = []) {\n  return [...colorRows].sort((a, b) => {\n    const aGreen = isChromaticGreenOrOlive(a);\n    const bGreen = isChromaticGreenOrOlive(b);\n    const aNeutralDark = isNeutralDarkColor(a);\n    const bNeutralDark = isNeutralDarkColor(b);\n    const aScore = a.pct * (aGreen ? 1.55 : 1) * (aNeutralDark ? 0.72 : 1);\n    const bScore = b.pct * (bGreen ? 1.55 : 1) * (bNeutralDark ? 0.72 : 1);\n    return bScore - aScore;\n  });\n}\n'''
new_sort = '''function sortLowerGarmentColors(colorRows = [], context = {}) {\n  const repeatedGreenSupport = Number(context?.greenWindowSupport || 0) >= 2;\n  const greenMultiplier = repeatedGreenSupport ? 2.15 : 1.55;\n  return [...colorRows].sort((a, b) => {\n    const aGreen = isChromaticGreenOrOlive(a);\n    const bGreen = isChromaticGreenOrOlive(b);\n    const aNeutralDark = isNeutralDarkColor(a);\n    const bNeutralDark = isNeutralDarkColor(b);\n    const aScore = a.pct * (aGreen ? greenMultiplier : 1) * (aNeutralDark ? 0.72 : 1);\n    const bScore = b.pct * (bGreen ? greenMultiplier : 1) * (bNeutralDark ? 0.72 : 1);\n    return bScore - aScore;\n  });\n}\n'''
if old_sort not in text:
    raise SystemExit('sortLowerGarmentColors block not found')
text = text.replace(old_sort, new_sort, 1)

old_loop_anchor = '''  const sampleBboxes = getDinoSamplePixelBboxes(pixelBbox, zone, context?.category || context?.label || "");\n  const samples = [];\n  let backgroundLike = 0;\n\n  for (const sampleBbox of sampleBboxes) {\n    const stride = Math.max(1, Math.floor(Math.sqrt((sampleBbox.width * sampleBbox.height) / 3000)));\n    for (let y = sampleBbox.y1; y < sampleBbox.y2; y += stride) {\n      for (let x = sampleBbox.x1; x < sampleBbox.x2; x += stride) {\n        const idx = (y * baseW + x) * 4;\n        const alpha = Number(data[idx + 3] ?? 255);\n        if (alpha < 20) continue;\n        const r = Number(data[idx] || 0);\n        const g = Number(data[idx + 1] || 0);\n        const b = Number(data[idx + 2] || 0);\n        const traits = getRgbTraits(r, g, b);\n        const bg = isNearWhiteOrBlackPixel(r, g, b);\n        const skin = isSkinLikePixel(r, g, b);\n        if (bg) backgroundLike += 1;\n        samples.push({ r, g, b, bg, skin, ...traits });\n      }\n    }\n  }\n'''
new_loop_anchor = '''  const sampleBboxes = getDinoSamplePixelBboxes(pixelBbox, zone, context?.category || context?.label || "");\n  const samples = [];\n  const lowerWindowStats = [];\n  let backgroundLike = 0;\n\n  for (const sampleBbox of sampleBboxes) {\n    const stride = Math.max(1, Math.floor(Math.sqrt((sampleBbox.width * sampleBbox.height) / 3000)));\n    const windowSamples = [];\n    for (let y = sampleBbox.y1; y < sampleBbox.y2; y += stride) {\n      for (let x = sampleBbox.x1; x < sampleBbox.x2; x += stride) {\n        const idx = (y * baseW + x) * 4;\n        const alpha = Number(data[idx + 3] ?? 255);\n        if (alpha < 20) continue;\n        const r = Number(data[idx] || 0);\n        const g = Number(data[idx + 1] || 0);\n        const b = Number(data[idx + 2] || 0);\n        const traits = getRgbTraits(r, g, b);\n        const bg = isNearWhiteOrBlackPixel(r, g, b);\n        const skin = isSkinLikePixel(r, g, b);\n        if (bg) backgroundLike += 1;\n        const sample = { r, g, b, bg, skin, ...traits };\n        samples.push(sample);\n        windowSamples.push(sample);\n      }\n    }\n    if (zoneKey === "lower_garment") {\n      const usableWindow = windowSamples.filter((sample) => !sample.bg && !sample.skin);\n      const greenCount = usableWindow.filter((sample) =>\n        sample.hue >= 65 && sample.hue <= 165 && sample.saturation >= 0.18 && sample.lightness <= 0.55\n      ).length;\n      lowerWindowStats.push({\n        label: sampleBbox.label || null,\n        sample_count: usableWindow.length,\n        green_share: usableWindow.length ? round2(greenCount / usableWindow.length) : 0,\n      });\n    }\n  }\n  const greenWindowSupport = lowerWindowStats.filter((row) => row.sample_count >= 8 && row.green_share >= 0.12).length;\n'''
if old_loop_anchor not in text:
    raise SystemExit('sample window loop not found')
text = text.replace(old_loop_anchor, new_loop_anchor, 1)

text = text.replace(
    'const rankedColorRows = zoneKey === "lower_garment" ? sortLowerGarmentColors(colorRows) : colorRows;',
    'const rankedColorRows = zoneKey === "lower_garment" ? sortLowerGarmentColors(colorRows, { greenWindowSupport }) : colorRows;',
    1,
)
text = text.replace(
    'const rankedClustersBeforeHeadwearBias = zoneKey === "lower_garment" ? sortLowerGarmentColors(clusters.map((cluster) => ({ ...cluster, hex: cluster.base }))) : clusters;',
    'const rankedClustersBeforeHeadwearBias = zoneKey === "lower_garment" ? sortLowerGarmentColors(clusters.map((cluster) => ({ ...cluster, hex: cluster.base })), { greenWindowSupport }) : clusters;',
    1,
)

debug_anchor = '''      sample_windows_after: zoneKey === "lower_garment" ? sampleBboxes : null,\n      previous_color_sample_bbox: zoneKey === "lower_garment" ? previousSampleBbox : null,\n      sample_count: samples.length,\n'''
debug_new = '''      sample_windows_after: zoneKey === "lower_garment" ? sampleBboxes : null,\n      previous_color_sample_bbox: zoneKey === "lower_garment" ? previousSampleBbox : null,\n      lower_window_stats: zoneKey === "lower_garment" ? lowerWindowStats : null,\n      green_window_support: zoneKey === "lower_garment" ? greenWindowSupport : 0,\n      sample_count: samples.length,\n'''
if debug_anchor not in text:
    raise SystemExit('debug anchor not found')
text = text.replace(debug_anchor, debug_new, 1)

old_export = 'export { buildOutfitAnalysis, inferZoneColorRead, inferGarmentZones, MARKET_PERCEPTION_V6_MODE };'
new_export = 'export { buildOutfitAnalysis, inferZoneColorRead, inferGarmentZones, MARKET_PERCEPTION_V6_MODE, extractDinoBboxRegionColors };'
if old_export not in text:
    raise SystemExit('export anchor not found')
text = text.replace(old_export, new_export, 1)
p.write_text(text)

# --- regression tests ---
Path('test/marketHardening02.test.js').write_text(r'''import test from "node:test";
import assert from "node:assert/strict";
import { analyzePerceptionV6 } from "../src/intelligence/perceptionV6/index.js";
process.env.NODE_ENV = "test";
const { extractDinoBboxRegionColors } = await import("../src/server.js");

function rgbaImage(width, height, painter) {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r,g,b] = painter(x,y);
      const i = (y * width + x) * 4;
      data[i] = r; data[i+1] = g; data[i+2] = b; data[i+3] = 255;
    }
  }
  return { width, height, data };
}

test("high-contrast hair plus face boundary is rejected as phantom headwear", () => {
  const image = rgbaImage(40, 40, (x,y) => {
    if (x >= 10 && x < 30 && y >= 2 && y < 16) {
      if (y < 12) return [18,18,20];
      return [175,112,82];
    }
    return [210,190,165];
  });
  const region = { id:"hat-fp", zone:"accessory_jewelry", segment_label:"hat", confidence:.88 };
  const perceptionV5 = {
    hypotheses:[{ region_index:0, strategy:"original", score:.88 }],
    normalized_regions:[{ normalized_box:{ x:.25, y:.05, w:.5, h:.35, x2:.75, y2:.40 } }],
    contradictions:[],
    arbitration:{ outcome:"accepted", confidence:.88 },
  };
  const result = analyzePerceptionV6({ perceptionV5, regions:[region], decodedImage:image, mode:"assist" });
  assert.equal(result.evidence_ledger[0].accepted, false);
  assert.equal(result.evidence_ledger[0].validation.reason, "hair_face_boundary_pattern");
  assert.equal(result.object_presence.accessory_jewelry.present, false);
});

test("repeated green evidence across lower-garment windows outranks near-black contamination", () => {
  const image = rgbaImage(120, 160, (x,y) => {
    // Within the pants bbox, repeat a forest-green body signal through every center window
    // while leaving a larger near-black share to reproduce the market failure shape.
    if (x >= 24 && x < 96 && y >= 40 && y < 150) {
      return (x % 10 < 3) ? [30,58,39] : [13,19,30];
    }
    return [185,160,135];
  });
  const extraction = extractDinoBboxRegionColors(
    image,
    { x_min:.15, y_min:.20, x_max:.85, y_max:.96 },
    6,
    { zone:"lower_garment", category:"pants", label:"pants" }
  );
  assert.ok(extraction.debug.green_window_support >= 2);
  assert.ok(extraction.colors.length >= 2);
  const top = extraction.colors[0];
  assert.match(String(top.name || "").toLowerCase(), /green|olive|forest|sage/);
});
''')
