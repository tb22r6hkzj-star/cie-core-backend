import test from "node:test";
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
