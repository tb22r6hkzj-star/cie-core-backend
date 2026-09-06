function clean(value) {
  return String(value || "").trim();
}

/**
 * A custom primary GroundingDINO query may tune the general detector pass, but
 * it must never disable the dedicated accessory lane. The accessory query is
 * always scheduled independently so environment configuration cannot erase
 * watch/earring coverage.
 */
export function buildGroundingDinoQueryPlanV1({
  configuredPrimaryQuery = "",
  defaultGarmentQuery = "",
  accessoryQuery = "",
} = {}) {
  const primaryQuery = clean(configuredPrimaryQuery) || clean(defaultGarmentQuery);
  const dedicatedAccessoryQuery = clean(accessoryQuery);
  const queries = [primaryQuery, dedicatedAccessoryQuery].filter(Boolean);

  return {
    version: "grounding_dino_query_plan_v1",
    primary_source: clean(configuredPrimaryQuery) ? "environment_override" : "visioncore_default_garment_query",
    dedicated_accessory_lane: Boolean(dedicatedAccessoryQuery),
    parallel_pass_count: queries.length,
    queries,
  };
}
