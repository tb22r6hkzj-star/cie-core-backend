from pathlib import Path

path = Path('src/server.js')
source = path.read_text()

import_anchor = 'import { attachAccessoryPositiveMaskOwnershipV1 } from "./intelligence/accessoryPositiveMaskOwnershipV1.js";\n'
import_insert = import_anchor + 'import { applyAccessoryMaskRecoveryV1 } from "./intelligence/accessoryMaskRecoveryV1.js";\n'
if import_insert not in source:
    if import_anchor not in source:
        raise SystemExit('accessory positive mask import anchor missing')
    source = source.replace(import_anchor, import_insert, 1)

old = '''  const positiveMaskDinoRegions = attachAccessoryPositiveMaskOwnershipV1(dedupedDinoRegions, samRegions);\n  const rawGarmentEvidenceRegions = samRegions.length ? samRegions.concat(positiveMaskDinoRegions) : attachAccessoryPositiveMaskOwnershipV1(dinoRegions, samRegions);\n'''
new = '''  const positiveMaskDinoRegions = attachAccessoryPositiveMaskOwnershipV1(dedupedDinoRegions, samRegions);\n  const accessoryMaskRecovery = samRegions.length\n    ? applyAccessoryMaskRecoveryV1(positiveMaskDinoRegions, samRegions)\n    : { regions: positiveMaskDinoRegions, summary: null };\n  const recoveredPositiveMaskDinoRegions = accessoryMaskRecovery.regions;\n  const rawGarmentEvidenceRegions = samRegions.length\n    ? samRegions.concat(recoveredPositiveMaskDinoRegions)\n    : attachAccessoryPositiveMaskOwnershipV1(dinoRegions, samRegions);\n'''
if new not in source:
    if old not in source:
        raise SystemExit('positive mask evidence anchor missing')
    source = source.replace(old, new, 1)

# Do not inject recovery telemetry through a global string anchor here.
# That can place accessoryMaskRecovery outside its lexical scope in server.js.
# Recovery remains live in the ownership path; telemetry should be wired later
# at an explicitly verified in-scope payload location.

path.write_text(source)
print('wired Accessory Mask Recovery V1 into live transform ownership path')
