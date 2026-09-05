from pathlib import Path

piece = Path('src/intelligence/pieceColorOwnershipV1.js')
source = piece.read_text()

old = '''  const positiveMask = region?.positive_accessory_mask_v1 || null;
  if (zone === "accessory_jewelry" && positiveMask) {
    const maskColors = (Array.isArray(region?.accessory_positive_mask_colors) ? region.accessory_positive_mask_colors : [])
'''
new = '''  const requiresPositiveJewelryMask = zone === "accessory_jewelry" && pieceClass(region) === "jewelry";
  if (requiresPositiveJewelryMask) {
    const positiveMask = region?.positive_accessory_mask_v1 || null;
    const maskColors = (Array.isArray(region?.accessory_positive_mask_colors) ? region.accessory_positive_mask_colors : [])
'''
if new not in source:
    if old not in source:
        raise SystemExit('positive mask conditional anchor missing')
    source = source.replace(old, new, 1)

old = '''    const validatedCandidates = [...samValidation.candidates, ...accessoryValidation.candidates];
    const authority = selectMeasuredColorAuthorityV1(
      buildMeasurementCandidates(region, interiorMeasurement, validatedCandidates)
    );
    const selected = authority.selected;

    if (!interiorMeasurement?.available || !selected || keptRatio < MIN_KEPT_SAMPLE_RATIO) {
'''
new = '''    const requiresPositiveJewelryMask = isAccessoryTarget && pieceClass(region) === "jewelry";
    const validatedCandidates = [...samValidation.candidates, ...accessoryValidation.candidates];
    const authorityCandidates = requiresPositiveJewelryMask
      ? accessoryValidation.candidates
      : buildMeasurementCandidates(region, interiorMeasurement, validatedCandidates);
    const authority = selectMeasuredColorAuthorityV1(authorityCandidates);
    const selected = authority.selected;
    const measurementAvailable = requiresPositiveJewelryMask
      ? accessoryValidation.candidates.length > 0
      : interiorMeasurement?.available;
    const sampleRatioValid = requiresPositiveJewelryMask ? true : keptRatio >= MIN_KEPT_SAMPLE_RATIO;

    if (!measurementAvailable || !selected || !sampleRatioValid) {
'''
if new not in source:
    if old not in source:
        raise SystemExit('authority candidate anchor missing')
    source = source.replace(old, new, 1)

old = '''          doctrine: isAccessoryTarget
            ? "nested_interior_stability_then_publish"
            : "measure_validate_publish",
'''
new = '''          doctrine: requiresPositiveJewelryMask
            ? "positive_mask_membership_precedes_jewelry_color"
            : isAccessoryTarget
              ? "nested_interior_stability_then_publish"
              : "measure_validate_publish",
'''
if new not in source:
    if old not in source:
        raise SystemExit('doctrine anchor missing')
    source = source.replace(old, new, 1)

piece.write_text(source)

measurement = Path('src/intelligence/measurementAuthorityV1.js')
m = measurement.read_text()
old = '''const SOURCE_PRIORITY = {
  sam_mask_interior: 100,
'''
new = '''const SOURCE_PRIORITY = {
  accessory_positive_mask_pixels: 110,
  sam_mask_interior: 100,
'''
if new not in m:
    if old not in m:
        raise SystemExit('source priority anchor missing')
    m = m.replace(old, new, 1)
old = '''    ["sam_mask_interior", "sam_mask", "owned_interior_pixels", "dino_bbox_interior", "dino_bbox"].includes(source)
'''
new = '''    ["accessory_positive_mask_pixels", "sam_mask_interior", "sam_mask", "owned_interior_pixels", "dino_bbox_interior", "dino_bbox"].includes(source)
'''
if new not in m:
    if old not in m:
        raise SystemExit('traceable source anchor missing')
    m = m.replace(old, new, 1)
measurement.write_text(m)

print('enforced positive-mask-only authority for true jewelry targets')
