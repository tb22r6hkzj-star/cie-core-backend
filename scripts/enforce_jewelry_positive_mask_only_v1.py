from pathlib import Path

path = Path('src/intelligence/pieceColorOwnershipV1.js')
source = path.read_text()
old = '''  const positiveMask = region?.positive_accessory_mask_v1 || null;
  if (zone === "accessory_jewelry" && positiveMask) {
    const maskColors = (Array.isArray(region?.accessory_positive_mask_colors) ? region.accessory_positive_mask_colors : [])
'''
new = '''  if (zone === "accessory_jewelry") {
    const positiveMask = region?.positive_accessory_mask_v1 || null;
    const maskColors = (Array.isArray(region?.accessory_positive_mask_colors) ? region.accessory_positive_mask_colors : [])
'''
if new not in source:
    if old not in source:
        raise SystemExit('positive mask conditional anchor missing')
    source = source.replace(old, new, 1)
path.write_text(source)
print('enforced jewelry positive-mask-only ownership')
