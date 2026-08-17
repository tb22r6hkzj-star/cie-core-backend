from pathlib import Path

policy = Path('src/ui/marketPublicationPolicy.js')
policy.write_text(r'''function isHeadwearIdentity(value) {
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
''')

path = Path('src/server.js')
text = path.read_text()

import_anchor = 'import { inferAccessoryDisplayMetadata } from "./ui/accessoryDisplay.js";\n'
import_replacement = import_anchor + '''import {
  marketHeadwearPublicationEnabled,
  shouldPublishMarketAccessoryIdentity,
} from "./ui/marketPublicationPolicy.js";
'''
if import_anchor not in text:
    raise SystemExit('accessory display import anchor missing')
text = text.replace(import_anchor, import_replacement, 1)

mode_anchor = '''const MARKET_PERCEPTION_V6_MODE = normalizePerceptionV6Mode(
  process.env.PERCEPTION_V6_MODE,
  "assist"
);
'''
mode_replacement = mode_anchor + '''
// Market safety: headwear perception remains available internally, but customer-facing
// assist publication stays off until hair-vs-headwear discrimination is validated.
const MARKET_HEADWEAR_PUBLICATION_ENABLED = marketHeadwearPublicationEnabled(process.env);
'''
if mode_anchor not in text:
    raise SystemExit('market mode anchor missing')
text = text.replace(mode_anchor, mode_replacement, 1)

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
      if (!shouldPublishMarketAccessoryIdentity({
        legacy,
        headwearEnabled: MARKET_HEADWEAR_PUBLICATION_ENABLED,
      })) return [];

      const legacyIdentityAccepted = legacyObjectType ? acceptedLabels.has(legacyObjectType) : true;
      if (legacyIdentityAccepted) return [[zone, legacy]];

      const reconciliation = acceptedPublicationByZone.get(zone) || null;
      if (!reconciliation?.selected_label) return [];
      if (!shouldPublishMarketAccessoryIdentity({
        selectedLabel: reconciliation.selected_label,
        headwearEnabled: MARKET_HEADWEAR_PUBLICATION_ENABLED,
      })) return [];
      const displayMetadata = inferAccessoryDisplayMetadata([reconciliation.selected_label]);
'''
if old not in text:
    raise SystemExit('assist accessory publication anchor missing')
text = text.replace(old, new, 1)
path.write_text(text)

Path('test/headwearMarketSuppressionV6.test.js').write_text(r'''import test from "node:test";
import assert from "node:assert/strict";
import {
  marketHeadwearPublicationEnabled,
  shouldPublishMarketAccessoryIdentity,
} from "../src/ui/marketPublicationPolicy.js";

test("market publication suppresses legacy headwear identities by default", () => {
  const fixtures = [
    { display_zone_label: "Headwear" },
    { object_type: "hat" },
    { accessory_type: "cap" },
    { name: "beanie" },
    { label: "hat" },
    { segment_label: "cap" },
  ];
  for (const legacy of fixtures) {
    assert.equal(
      shouldPublishMarketAccessoryIdentity({ legacy, headwearEnabled: false }),
      false,
      JSON.stringify(legacy)
    );
  }
});

test("market publication suppresses reconciled headwear labels by default", () => {
  assert.equal(shouldPublishMarketAccessoryIdentity({ selectedLabel: "hat", headwearEnabled: false }), false);
  assert.equal(shouldPublishMarketAccessoryIdentity({ selectedLabel: "beanie", headwearEnabled: false }), false);
});

test("market publication keeps non-headwear accessory identities available", () => {
  assert.equal(shouldPublishMarketAccessoryIdentity({
    legacy: { display_zone_label: "Jewelry", object_type: "necklace", accessory_type: "necklace" },
    headwearEnabled: false,
  }), true);
  assert.equal(shouldPublishMarketAccessoryIdentity({ selectedLabel: "necklace", headwearEnabled: false }), true);
  assert.equal(shouldPublishMarketAccessoryIdentity({ selectedLabel: "watch", headwearEnabled: false }), true);
});

test("headwear market publication flag is off by default and explicitly reversible", () => {
  assert.equal(marketHeadwearPublicationEnabled({}), false);
  assert.equal(marketHeadwearPublicationEnabled({ HEADWEAR_MARKET_PUBLICATION_ENABLED: "true" }), true);
  assert.equal(shouldPublishMarketAccessoryIdentity({ selectedLabel: "hat", headwearEnabled: true }), true);
});
''')
