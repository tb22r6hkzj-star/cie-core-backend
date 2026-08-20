function cloneZone(zone) {
  if (!zone || typeof zone !== "object") return zone;
  return {
    ...zone,
    dominant_color: zone.dominant_color ? { ...zone.dominant_color } : zone.dominant_color,
    primary_color: zone.primary_color ? { ...zone.primary_color } : zone.primary_color,
    support_colors: Array.isArray(zone.support_colors) ? zone.support_colors.map((c) => ({ ...c })) : zone.support_colors,
    accent_colors: Array.isArray(zone.accent_colors) ? zone.accent_colors.map((c) => ({ ...c })) : zone.accent_colors,
    secondary_colors: Array.isArray(zone.secondary_colors) ? zone.secondary_colors.map((c) => ({ ...c })) : zone.secondary_colors,
    region_colors: Array.isArray(zone.region_colors) ? zone.region_colors.map((c) => ({ ...c })) : zone.region_colors,
  };
}

/**
 * Publication Consistency V2
 *
 * Color-evidence enrichment returns a new zones map. This helper makes that
 * enriched map the one canonical published zone collection while preserving
 * garment-zone container metadata (version, segmented regions, diagnostics,
 * confidence maps, publication mode, etc.).
 *
 * Safety invariant:
 *   Once a zone has been finalized/enriched by Color Evidence, no downstream
 *   consumer may silently fall back to the stale pre-enrichment zone object.
 */
export function buildPublishedGarmentZonesV2(garmentZones = {}, enrichedZones = {}) {
  const legacyZones = garmentZones?.zones && typeof garmentZones.zones === "object"
    ? garmentZones.zones
    : {};
  const resolvedZones = enrichedZones && typeof enrichedZones === "object"
    ? enrichedZones
    : {};

  const mergedZones = Object.fromEntries(
    Object.entries({ ...legacyZones, ...resolvedZones }).map(([key, value]) => [key, cloneZone(value)])
  );

  return {
    ...garmentZones,
    zones: mergedZones,
    publication_authority: "color_evidence_v3_enriched_zones",
    publication_consistency_version: "v2",
  };
}
