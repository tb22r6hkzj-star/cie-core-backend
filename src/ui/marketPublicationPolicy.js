function isHeadwearIdentity(value) {
  return /^(hat|cap|beanie|headwear)$/i.test(String(value || "").trim());
}

function legacyCarriesHeadwearIdentity(legacy = null) {
  if (!legacy || typeof legacy !== "object") return false;
  return [
    legacy.display_zone_label,
    legacy.object_type,
    legacy.accessory_type,
    legacy.name,
    legacy.label,
    legacy.segment_label,
    legacy.category,
  ].some((value) => isHeadwearIdentity(value));
}

export function marketHeadwearPublicationEnabled(env = process.env) {
  return /^(1|true|yes|on)$/i.test(
    String(env?.HEADWEAR_MARKET_PUBLICATION_ENABLED || "")
  );
}

export function shouldPublishMarketAccessoryIdentity({
  legacy = null,
  selectedLabel = null,
  headwearEnabled = false,
} = {}) {
  if (headwearEnabled) return true;
  return !legacyCarriesHeadwearIdentity(legacy) && !isHeadwearIdentity(selectedLabel);
}
