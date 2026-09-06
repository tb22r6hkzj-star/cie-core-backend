from pathlib import Path

path = Path('src/intelligence/pieceColorOwnershipV1.js')
source = path.read_text()

anchor = '''function buildAccessoryNestedInteriorValidation(region, targetBox, decodedImage) {\n  const zone = String(region?.zone || "");'''
replacement = '''function accessorySemanticExclusionBoxesV2(region = {}) {\n  return (Array.isArray(region?.accessory_semantic_exclusions_v2) ? region.accessory_semantic_exclusions_v2 : [])\n    .filter((row) => normalizeConfidence(row?.confidence) >= 0.6)\n    .map((row) => row?.bbox)\n    .filter(Boolean);\n}\n\nfunction buildAccessoryNestedInteriorValidation(region, targetBox, decodedImage) {\n  const zone = String(region?.zone || "");'''
if replacement not in source:
    if anchor not in source:
        raise SystemExit('nested accessory validation anchor missing')
    source = source.replace(anchor, replacement, 1)

conf_anchor = '''  const confidence = normalizeConfidence(region?.confidence);'''
conf_replacement = '''  const confidence = normalizeConfidence(region?.confidence);\n  const semanticExclusions = accessorySemanticExclusionBoxesV2(region);'''
if conf_replacement not in source:
    if conf_anchor not in source:
        raise SystemExit('confidence anchor missing')
    source = source.replace(conf_anchor, conf_replacement, 1)

outer_anchor = '''    decodedImage,\n    bbox: targetBox,\n    insetRatio: zone === "accessory_jewelry" ? 0.24 : ACCESSORY_OUTER_INSET,'''
outer_replacement = '''    decodedImage,\n    bbox: targetBox,\n    exclusions: semanticExclusions,\n    insetRatio: zone === "accessory_jewelry" ? 0.24 : ACCESSORY_OUTER_INSET,'''
if outer_replacement not in source:
    if outer_anchor not in source:
        raise SystemExit('outer sampler anchor missing')
    source = source.replace(outer_anchor, outer_replacement, 1)

inner_anchor = '''    decodedImage,\n    bbox: targetBox,\n    insetRatio: zone === "accessory_jewelry" ? 0.33 : ACCESSORY_INNER_INSET,'''
inner_replacement = '''    decodedImage,\n    bbox: targetBox,\n    exclusions: semanticExclusions,\n    insetRatio: zone === "accessory_jewelry" ? 0.33 : ACCESSORY_INNER_INSET,'''
if inner_replacement not in source:
    if inner_anchor not in source:
        raise SystemExit('inner sampler anchor missing')
    source = source.replace(inner_anchor, inner_replacement, 1)

validator_anchor = '''    inner_sample_count: Number(inner?.sample_count || 0),\n    confidence: round3(confidence),'''
validator_replacement = '''    inner_sample_count: Number(inner?.sample_count || 0),\n    semantic_exclusion_count_v2: semanticExclusions.length,\n    outer_excluded_sample_count_v2: Number(outer?.excluded_sample_count || 0),\n    inner_excluded_sample_count_v2: Number(inner?.excluded_sample_count || 0),\n    confidence: round3(confidence),'''
if validator_replacement not in source:
    if validator_anchor not in source:
        raise SystemExit('validator metadata anchor missing')
    source = source.replace(validator_anchor, validator_replacement, 1)

doctrine_old = 'doctrine: "detector_box_proposes_nested_pixel_stability_validates",'
doctrine_new = 'doctrine: semanticExclusions.length ? "semantic_exclusions_plus_nested_pixel_stability_validate" : "detector_box_proposes_nested_pixel_stability_validates",'
if doctrine_new not in source:
    if doctrine_old not in source:
        raise SystemExit('doctrine anchor missing')
    source = source.replace(doctrine_old, doctrine_new, 1)

path.write_text(source)
print('wired accessory semantic exclusions v2 into ownership sampler')
