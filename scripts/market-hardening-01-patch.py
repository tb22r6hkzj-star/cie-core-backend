from pathlib import Path

path = Path('src/server.js')
text = path.read_text()

anchor = 'const LOWER_SAMPLING_VERSION = "multi_window_v1";\n'
insert = '''const LOWER_SAMPLING_VERSION = "multi_window_v1";\nconst PERCEPTION_V6_MODES = new Set(["shadow", "assist", "authoritative"]);\n\nfunction normalizePerceptionV6Mode(value, fallback = "shadow") {\n  const requested = String(value || "").trim().toLowerCase();\n  if (PERCEPTION_V6_MODES.has(requested)) return requested;\n  return PERCEPTION_V6_MODES.has(fallback) ? fallback : "shadow";\n}\n\nconst MARKET_PERCEPTION_V6_MODE = normalizePerceptionV6Mode(\n  process.env.PERCEPTION_V6_MODE,\n  "assist"\n);\n'''
if anchor not in text:
    raise SystemExit('constant anchor missing')
text = text.replace(anchor, insert, 1)

old_mode = '''  const requestedV6Mode = perception_v6_mode ?? v6_mode ?? "shadow";\n  const perceptionV6Mode = ["shadow", "assist", "authoritative"].includes(requestedV6Mode)\n    ? requestedV6Mode\n    : "shadow";\n'''
new_mode = '''  const perceptionV6Mode = normalizePerceptionV6Mode(perception_v6_mode ?? v6_mode, "shadow");\n'''
if old_mode not in text:
    raise SystemExit('buildOutfitAnalysis mode block missing')
text = text.replace(old_mode, new_mode, 1)

needle = '        decodedImage: analysis.decodedImage,\n'
count = text.count(needle)
if count != 3:
    raise SystemExit(f'expected 3 market route decodedImage anchors, found {count}')
text = text.replace(needle, needle + '        perception_v6_mode: MARKET_PERCEPTION_V6_MODE,\n')

old_export = 'export { buildOutfitAnalysis, inferZoneColorRead, inferGarmentZones };'
new_export = 'export { buildOutfitAnalysis, inferZoneColorRead, inferGarmentZones, MARKET_PERCEPTION_V6_MODE };'
if old_export not in text:
    raise SystemExit('export anchor missing')
text = text.replace(old_export, new_export, 1)

path.write_text(text)

Path('test/marketPerceptionMode.test.js').write_text('''import test from "node:test";\nimport assert from "node:assert/strict";\nimport fs from "node:fs";\n\nprocess.env.NODE_ENV = "test";\ndelete process.env.PERCEPTION_V6_MODE;\nconst { buildOutfitAnalysis, MARKET_PERCEPTION_V6_MODE } = await import("../src/server.js");\n\nconst base = {\n  dominantHex: "#334455",\n  topColors: [\n    { hex: "#334455", pct: 0.7 },\n    { hex: "#eeeeee", pct: 0.3 },\n  ],\n  segmentedRegions: [],\n};\n\ntest("market API perception mode defaults to assist", () => {\n  assert.equal(MARKET_PERCEPTION_V6_MODE, "assist");\n});\n\ntest("library buildOutfitAnalysis default remains shadow for compatibility", () => {\n  const result = buildOutfitAnalysis(base);\n  assert.equal(result.perception_v6_mode, "shadow");\n});\n\ntest("all market-facing analysis routes explicitly use the market perception mode", () => {\n  const source = fs.readFileSync(new URL("../src/server.js", import.meta.url), "utf8");\n  const matches = source.match(/perception_v6_mode:\\s*MARKET_PERCEPTION_V6_MODE/g) || [];\n  assert.equal(matches.length, 3);\n});\n''')
