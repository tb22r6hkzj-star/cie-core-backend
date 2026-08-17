from pathlib import Path
p=Path('src/server.js')
s=p.read_text()
old='import { analyzePerceptionV6 } from "./intelligence/perceptionV6/index.js";'
new=old+'\nimport { attachColorEvidenceToZones } from "./intelligence/colorEvidence/index.js";'
if old not in s: raise SystemExit('import anchor missing')
s=s.replace(old,new,1)
anchor='''  const legacyGarmentZones = inferGarmentZones(\n    normalizedColors,\n    colorRoles,\n    visualIntelligence,\n    garmentEvidenceRegions\n  );'''
replacement=anchor+'''\n  // Color Evidence V1 is a separate shadow diagnostics envelope. It must not\n  // mutate legacy garment-zone objects or change publication behavior.\n  const colorEvidenceShadowZones = attachColorEvidenceToZones({\n    zones: legacyGarmentZones.zones,\n    regions: garmentEvidenceRegions,\n    decodedImage,\n  });\n  const colorEvidenceV1 = {\n    version: "color_evidence_v1",\n    mode: "shadow",\n    zones: Object.fromEntries(\n      Object.entries(colorEvidenceShadowZones || {}).map(([zone, value]) => [zone, value?.color_evidence_v1 || { available: false, reason: "no_zone_evidence" }])\n    ),\n  };'''
if anchor not in s: raise SystemExit('legacy garment zone anchor missing')
s=s.replace(anchor,replacement,1)
return_anchor='''    color_authority: {\n      source: reasoningColors === normalizedColors ? "global_palette_fallback" : "published_garment_primaries",\n      colors: reasoningColors.map((c) => ({ hex: c.hex, name: c.name || getColorName(c.hex), source_zone: c.source_zone || null, source: c.source || null })),\n    },'''
return_replacement=return_anchor+'''\n    color_evidence_v1: colorEvidenceV1,'''
if return_anchor not in s: raise SystemExit('return color authority anchor missing')
s=s.replace(return_anchor,return_replacement,1)
p.write_text(s)
