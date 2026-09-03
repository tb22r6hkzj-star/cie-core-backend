from pathlib import Path

path = Path('src/intelligence/accessoryPublicationBridgeV1.js')
source = path.read_text()

source = source.replace('''function bridgeInstance(instance, region) {\n  if (!region) return instance;\n''','''function bridgeInstance(instance, region) {\n  if (!region) return instance;\n''',1)

old_update = '''function updateVisibleAccessoryZones(originalZones = {}, instances = []) {\n  const zones = { ...originalZones };\n  for (const [zoneKey, zone] of Object.entries(originalZones)) {\n    const type = zoneType(zoneKey, zone);\n    const instance = instances.find((candidate) => instanceType(candidate) === type);\n    if (instance) zones[zoneKey] = instance;\n  }\n  for (const instance of instances) {\n    if (instance?.zone_key && Object.hasOwn(zones, instance.zone_key)) zones[instance.zone_key] = instance;\n  }\n  return zones;\n}\n'''
new_update = '''function suppressLegacyJewelryColor(zone = {}, type = null) {\n  const jewelry = new Set([\"watch\", \"earrings\", \"ring\", \"bracelet\", \"necklace\", \"chain\", \"pendant\", \"shoe_hardware\"]);\n  if (!jewelry.has(type)) return zone;\n  return {\n    ...zone,\n    hex: null,\n    dominant_hex: null,\n    primary_color: null,\n    dominant_color: null,\n    region_colors: [],\n    detected_colors: [],\n    secondary_colors: [],\n    support_colors: [],\n    signature_color: null,\n    color_publication_decision: \"withhold_unvalidated_color\",\n    validation_decision: \"identity_only\",\n    validation_reason: \"authoritative_accessory_instance_missing_or_withheld\",\n    stale_accessory_palette_suppressed: true,\n    accessory_final_publication_gate_v1: true,\n  };\n}\n\nfunction updateVisibleAccessoryZones(originalZones = {}, instances = []) {\n  const zones = { ...originalZones };\n  for (const [zoneKey, zone] of Object.entries(originalZones)) {\n    const type = zoneType(zoneKey, zone);\n    const instance = instances.find((candidate) => instanceType(candidate) === type);\n    if (instance) {\n      zones[zoneKey] = instance;\n    } else {\n      zones[zoneKey] = suppressLegacyJewelryColor(zone, type);\n    }\n  }\n  for (const instance of instances) {\n    if (instance?.zone_key && Object.hasOwn(zones, instance.zone_key)) zones[instance.zone_key] = instance;\n  }\n  return zones;\n}\n'''
if old_update not in source:
    raise SystemExit('visible zone updater anchor not found')
source = source.replace(old_update,new_update,1)

source = source.replace('''  const regions = ownershipRegions(analysis);\n  if (!regions.length) return analysis;\n\n  const instances = bundle.instances.map((instance) => bridgeInstance(instance, chooseRegion(instance, regions)));\n''','''  const regions = ownershipRegions(analysis);\n  const instances = bundle.instances.map((instance) => bridgeInstance(instance, chooseRegion(instance, regions)));\n''',1)

source = source.replace('''        visible_zone_matching: \"normalized_accessory_identity\",\n''','''        visible_zone_matching: \"normalized_accessory_identity\",\n        final_publication_gate_version: \"accessory_final_publication_gate_v1\",\n''',1)

path.write_text(source)
print('patched accessory final publication gate v1')
