from pathlib import Path

server = Path('src/server.js')
s = server.read_text()
imp_anchor = 'import { attachBeltLocalizationV1 } from "./intelligence/beltLocalizationV1.js";\n'
imp_line = 'import { attachAccessoryPositiveMaskOwnershipV1 } from "./intelligence/accessoryPositiveMaskOwnershipV1.js";\n'
if imp_line not in s:
    if imp_anchor not in s:
        raise SystemExit('server import anchor missing')
    s = s.replace(imp_anchor, imp_line + imp_anchor, 1)
old = '  const rawGarmentEvidenceRegions = samRegions.length ? samRegions.concat(dedupedDinoRegions) : dinoRegions;\n  const pieceColorOwnership = applyPieceColorOwnershipV1({\n'
new = '  const positiveMaskDinoRegions = attachAccessoryPositiveMaskOwnershipV1(dedupedDinoRegions, samRegions);\n  const rawGarmentEvidenceRegions = samRegions.length ? samRegions.concat(positiveMaskDinoRegions) : attachAccessoryPositiveMaskOwnershipV1(dinoRegions, samRegions);\n  const pieceColorOwnership = applyPieceColorOwnershipV1({\n'
if new not in s:
    if old not in s:
        raise SystemExit('server ownership anchor missing')
    s = s.replace(old, new, 1)
server.write_text(s)

piece = Path('src/intelligence/pieceColorOwnershipV1.js')
p = piece.read_text()
anchor = '''  const confidence = normalizeConfidence(region?.confidence);\n  if (confidence < ACCESSORY_MIN_CONFIDENCE) {\n    return { candidates: [], validators: [], measurements: null, reason: "accessory_confidence_too_low" };\n  }\n\n  const outer = measureDinoInteriorPixelsV1({\n'''
replacement = '''  const confidence = normalizeConfidence(region?.confidence);\n  if (confidence < ACCESSORY_MIN_CONFIDENCE) {\n    return { candidates: [], validators: [], measurements: null, reason: "accessory_confidence_too_low" };\n  }\n\n  const positiveMask = region?.positive_accessory_mask_v1 || null;\n  if (zone === "accessory_jewelry" && positiveMask) {\n    const maskColors = (Array.isArray(region?.accessory_positive_mask_colors) ? region.accessory_positive_mask_colors : [])\n      .map((color) => ({ ...color, hex: safeHex(color?.hex) }))\n      .filter((color) => !!color.hex);\n    if (positiveMask?.validated !== true || !maskColors.length) {\n      return {\n        candidates: [],\n        validators: [{\n          validator: "positive_accessory_mask_ownership_v1",\n          target_zone: zone,\n          validated: false,\n          reason: positiveMask?.reason || "positive_accessory_mask_required",\n          sam_region_id: positiveMask?.sam_region_id || null,\n          authority_owner: "visioncore",\n        }],\n        measurements: { positive_mask: positiveMask },\n        reason: "positive_accessory_mask_required",\n      };\n    }\n    const validator = {\n      validator: "positive_accessory_mask_ownership_v1",\n      target_zone: zone,\n      validated: true,\n      reason: positiveMask?.reason || "positive_accessory_mask_validated",\n      sam_region_id: positiveMask?.sam_region_id || null,\n      target_overlap_ratio: positiveMask?.target_overlap_ratio ?? null,\n      mask_overlap_ratio: positiveMask?.mask_overlap_ratio ?? null,\n      confidence: positiveMask?.confidence ?? confidence,\n      authority_owner: "visioncore",\n      doctrine: "positive_mask_membership_precedes_jewelry_color",\n    };\n    const candidates = maskColors.slice(0, accessoryPaletteLimit(zone)).map((color) => ({\n      ...color,\n      source: "accessory_positive_mask_pixels",\n      measurement_source: "accessory_positive_mask_pixels",\n      ownership_state: "owned",\n      ownership_validated: true,\n      ownership_validation: validator,\n      confidence,\n      traceable_to_pixels: true,\n      interior_ratio: 1,\n    }));\n    return { candidates, validators: [validator], measurements: { positive_mask: positiveMask }, reason: null };\n  }\n\n  const outer = measureDinoInteriorPixelsV1({\n'''
if replacement not in p:
    if anchor not in p:
        raise SystemExit('piece ownership anchor missing')
    p = p.replace(anchor, replacement, 1)
piece.write_text(p)
print('wired Accessory Positive Mask Ownership V1')
