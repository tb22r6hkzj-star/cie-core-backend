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
new = '''  const positiveMaskDinoRegions = attachAccessoryPositiveMaskOwnershipV1(dedupedDinoRegions, samRegions);\n  const accessoryMaskRecovery = applyAccessoryMaskRecoveryV1(positiveMaskDinoRegions, samRegions);\n  const recoveredPositiveMaskDinoRegions = accessoryMaskRecovery.regions;\n  const rawGarmentEvidenceRegions = samRegions.length\n    ? samRegions.concat(recoveredPositiveMaskDinoRegions)\n    : applyAccessoryMaskRecoveryV1(attachAccessoryPositiveMaskOwnershipV1(dinoRegions, samRegions), samRegions).regions;\n'''
if new not in source:
    if old not in source:
        raise SystemExit('positive mask evidence anchor missing')
    source = source.replace(old, new, 1)

# Add recovery summary to debug payload next to piece ownership when possible.
anchor = 'piece_color_ownership_v1: pieceColorOwnership.summary,\n'
replacement = anchor + '      accessory_mask_recovery_v1: accessoryMaskRecovery.summary,\n'
if replacement not in source and anchor in source:
    source = source.replace(anchor, replacement, 1)

path.write_text(source)
print('wired Accessory Mask Recovery V1 into live transform ownership path')
