from pathlib import Path
p=Path('src/server.js')
s=p.read_text()
old='import { analyzePerceptionV6 } from "./intelligence/perceptionV6/index.js";'
new=old+'\nimport { attachColorEvidenceToZones } from "./intelligence/colorEvidence/index.js";'
if old not in s: raise SystemExit('import anchor missing')
s=s.replace(old,new,1)
anchor='''  const legacyGarmentZones = inferGarmentZones(\n    normalizedColors,\n    colorRoles,\n    visualIntelligence,\n    garmentEvidenceRegions\n  );'''
replacement=anchor+'''\n  // Color Evidence V1 runs in diagnostic/shadow mode: it measures interior\n  // multi-window consensus and region purity without changing publication.\n  legacyGarmentZones.zones = attachColorEvidenceToZones({\n    zones: legacyGarmentZones.zones,\n    regions: garmentEvidenceRegions,\n    decodedImage,\n  });'''
if anchor not in s: raise SystemExit('legacy garment zone anchor missing')
s=s.replace(anchor,replacement,1)
p.write_text(s)
