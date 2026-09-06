from pathlib import Path

path = Path('src/intelligence/accessoryInstancesV1.js')
source = path.read_text()

import_old = 'import { classifyMeasuredMetallicPaletteV1 } from "./metallicColorIdentityV1.js";\n'
import_new = import_old + 'import { resolveAccessoryEvidenceV1 } from "./accessoryEvidenceContractV1.js";\n'
if 'resolveAccessoryEvidenceV1' not in source:
    if import_old not in source:
        raise SystemExit('expected import anchor missing')
    source = source.replace(import_old, import_new, 1)

old = '''  const measurementAccepted = entry?.accepted === true;\n  const targetedIdentity = targetedIdentityEligible(entry);\n\n  // Identity and color are deliberately separate authorities. A bounded,\n  // targeted VisionCore spatial detection may publish the accessory identity\n  // even when color ownership/validation abstains. Color still requires the\n  // original accepted measurement path and can never come from OpenAI.\n  const identityAccepted = directSpatialSource\n    && confidence >= (CONFIDENCE_FLOORS[type] || 0.5)\n    && (measurementAccepted || targetedIdentity);\n  const pixelSupported = pixels?.available === true && validation?.supported === true && Number(pixels?.sample_count || 0) >= 6;\n  const colorAccepted = measurementAccepted && identityAccepted && pixelSupported && colors.length > 0;\n'''
new = '''  const measurementAccepted = entry?.accepted === true;\n  const targetedIdentity = targetedIdentityEligible(entry);\n  const pixelSupported = pixels?.available === true && validation?.supported === true && Number(pixels?.sample_count || 0) >= 6;\n  const evidenceContract = resolveAccessoryEvidenceV1({\n    entry,\n    type,\n    confidenceFloor: CONFIDENCE_FLOORS[type] || 0.5,\n    targetedIdentity,\n    measurementAccepted,\n    pixelSupported,\n    colorsAvailable: colors.length > 0,\n  });\n  const identityAccepted = evidenceContract.publish_identity;\n  const colorAccepted = evidenceContract.publish_color;\n'''
if old in source:
    source = source.replace(old, new, 1)
elif 'const evidenceContract = resolveAccessoryEvidenceV1' not in source:
    raise SystemExit('expected evaluateEntry authority block missing')

old_return = '''    targetedIdentity,\n    evidenceId: entry?.id || null,\n'''
new_return = '''    targetedIdentity,\n    evidenceContract,\n    evidenceId: entry?.id || null,\n'''
if old_return in source:
    source = source.replace(old_return, new_return, 1)
elif 'evidenceContract,' not in source:
    raise SystemExit('expected evaluateEntry return anchor missing')

old_authority = '''    source_type: "visioncore_accessory_instances_v1",\n    identity_authority_source: entry.targetedIdentity ? "visioncore_targeted_spatial_detection" : "visioncore_evidence_ledger",\n    color_authority_source: colorAccepted ? "visioncore_object_local_pixels" : null,\n    external_color_authority: false,\n'''
new_authority = '''    source_type: "visioncore_accessory_instances_v1",\n    identity_authority_source: entry.evidenceContract?.identity_authority_source || null,\n    color_authority_source: colorAccepted ? entry.evidenceContract?.color_authority_source || "visioncore_object_local_pixels" : null,\n    external_color_authority: false,\n    accessory_evidence_contract_v1: entry.evidenceContract || null,\n'''
if old_authority in source:
    source = source.replace(old_authority, new_authority, 1)
elif 'accessory_evidence_contract_v1:' not in source:
    raise SystemExit('expected buildInstance authority block missing')

path.write_text(source)
print('Accessory Evidence Contract V1 wired into accessoryInstancesV1.js')
