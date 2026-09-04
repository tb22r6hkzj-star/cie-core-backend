from pathlib import Path

path = Path('src/intelligence/accessoryPublicationBridgeV1.js')
source = path.read_text()
old = 'function bridgeInstance(instance, region) {\n  if (!region) return instance;\n'
new = '''function bridgeInstance(instance, region) {\n  if (!region) {\n    const type = instanceType(instance);\n    const jewelry = new Set(["watch", "earrings", "ring", "bracelet", "necklace", "chain", "pendant", "shoe_hardware"]);\n    if (!jewelry.has(type)) return instance;\n    return {\n      ...instance,\n      object_local_colors: [],\n      support_colors: [],\n      secondary_colors: [],\n      region_colors: [],\n      detected_colors: [],\n      hex: null,\n      dominant_hex: null,\n      dominant_color: null,\n      primary_color: null,\n      signature_color: null,\n      color_publication_decision: "withhold_unvalidated_color",\n      validation_decision: "identity_only",\n      validation_reason: "no_validated_accessory_ownership_region",\n      color_authority_source: "piece_color_ownership_v1",\n      stale_accessory_palette_suppressed: true,\n      accessory_final_publication_gate_v1: true,\n    };\n  }\n'''
if new not in source:
    if old not in source:
        raise SystemExit('bridgeInstance no-region anchor not found')
    source = source.replace(old, new, 1)
path.write_text(source)
print('wired no-region accessory publication gate')
