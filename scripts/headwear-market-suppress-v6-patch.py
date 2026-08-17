from pathlib import Path

path = Path('src/server.js')
text = path.read_text()

anchor = '''const MARKET_PERCEPTION_V6_MODE = normalizePerceptionV6Mode(
  process.env.PERCEPTION_V6_MODE,
  "assist"
);
'''
replacement = anchor + '''
// Market safety: headwear perception remains available internally, but customer-facing
// assist publication stays off until hair-vs-headwear discrimination is validated.
const MARKET_HEADWEAR_PUBLICATION_ENABLED = /^(1|true|yes|on)$/i.test(
  String(process.env.HEADWEAR_MARKET_PUBLICATION_ENABLED || "")
);

function isHeadwearIdentity(value) {
  return /^(hat|cap|beanie|headwear)$/i.test(String(value || "").trim());
}

export function shouldPublishMarketAccessoryIdentity({ legacy = null, selectedLabel = null } = {}) {
  if (MARKET_HEADWEAR_PUBLICATION_ENABLED) return true;
  const legacyObjectType = String(legacy?.object_type || legacy?.accessory_type || "").trim().toLowerCase();
  const legacyIsHeadwear = legacy?.display_zone_label === "Headwear" || isHeadwearIdentity(legacyObjectType);
  if (legacyIsHeadwear) return false;
  if (isHeadwearIdentity(selectedLabel)) return false;
  return true;
}
'''
if anchor not in text:
    raise SystemExit('market mode anchor missing')
text = text.replace(anchor, replacement, 1)

old = '''      const legacyObjectType = String(legacy?.object_type || legacy?.accessory_type || "").trim().toLowerCase();
      const acceptedLabels = acceptedLabelsByZone.get(zone) || new Set();
      const legacyIdentityAccepted = legacyObjectType ? acceptedLabels.has(legacyObjectType) : true;
      if (legacyIdentityAccepted) return [[zone, legacy]];

      const reconciliation = acceptedPublicationByZone.get(zone) || null;
      if (!reconciliation?.selected_label) return [];
      const displayMetadata = inferAccessoryDisplayMetadata([reconciliation.selected_label]);
'''
new = '''      const legacyObjectType = String(legacy?.object_type || legacy?.accessory_type || "").trim().toLowerCase();
      const acceptedLabels = acceptedLabelsByZone.get(zone) || new Set();
      if (!shouldPublishMarketAccessoryIdentity({ legacy })) return [];

      const legacyIdentityAccepted = legacyObjectType ? acceptedLabels.has(legacyObjectType) : true;
      if (legacyIdentityAccepted) return [[zone, legacy]];

      const reconciliation = acceptedPublicationByZone.get(zone) || null;
      if (!reconciliation?.selected_label) return [];
      if (!shouldPublishMarketAccessoryIdentity({ selectedLabel: reconciliation.selected_label })) return [];
      const displayMetadata = inferAccessoryDisplayMetadata([reconciliation.selected_label]);
'''
if old not in text:
    raise SystemExit('assist accessory publication anchor missing')
text = text.replace(old, new, 1)
path.write_text(text)

Path('test/headwearMarketSuppressionV6.test.js').write_text(r'''import test from "node:test";
import assert from "node:assert/strict";

process.env.NODE_ENV = "test";
delete process.env.HEADWEAR_MARKET_PUBLICATION_ENABLED;
const { shouldPublishMarketAccessoryIdentity } = await import("../src/server.js");

test("market publication suppresses legacy headwear identities by default", () => {
  assert.equal(shouldPublishMarketAccessoryIdentity({
    legacy: { display_zone_label: "Headwear", object_type: "hat", accessory_type: "hat" },
  }), false);
  assert.equal(shouldPublishMarketAccessoryIdentity({
    legacy: { display_zone_label: "Headwear", object_type: "cap", accessory_type: "cap" },
  }), false);
});

test("market publication suppresses reconciled headwear labels by default", () => {
  assert.equal(shouldPublishMarketAccessoryIdentity({ selectedLabel: "hat" }), false);
  assert.equal(shouldPublishMarketAccessoryIdentity({ selectedLabel: "beanie" }), false);
});

test("market publication keeps non-headwear accessory identities available", () => {
  assert.equal(shouldPublishMarketAccessoryIdentity({
    legacy: { display_zone_label: "Jewelry", object_type: "necklace", accessory_type: "necklace" },
  }), true);
  assert.equal(shouldPublishMarketAccessoryIdentity({ selectedLabel: "necklace" }), true);
  assert.equal(shouldPublishMarketAccessoryIdentity({ selectedLabel: "watch" }), true);
});
''')
