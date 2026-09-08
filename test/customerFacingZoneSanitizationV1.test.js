import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeCustomerFacingZonesV1 } from "../src/intelligence/customerFacingZoneSanitizationV1.js";

test("removes a legacy accessory alias when its canonical instance owns the same evidence", () => {
  const analysis = { garment_zones: { zones: {
    accessory_jewelry: { label: "necklace", evidence_ids: ["dino_4"] },
    accessory_necklace: { label: "necklace", evidence_ids: ["dino_4"], identity_publication_decision: "publish" },
  } } };
  const zones = sanitizeCustomerFacingZonesV1(analysis).garment_zones.zones;
  assert.equal(zones.accessory_jewelry, undefined);
  assert.equal(zones.accessory_necklace.label, "necklace");
});

test("scrubs stale color identity from an uncertain footwear card", () => {
  const analysis = { garment_zones: { zones: { footwear: {
    name: "Luxury Tan", label: "Luxury Tan", hex: null, interpretation: "unknown",
    dominant_color: { hex: "#C49A6C" }, detected_colors: [{ hex: "#C49A6C" }],
  } } } };
  const footwear = sanitizeCustomerFacingZonesV1(analysis).garment_zones.zones.footwear;
  assert.equal(footwear.name, "Footwear");
  assert.equal(footwear.dominant_color, null);
  assert.deepEqual(footwear.detected_colors, []);
});

test("removes inconclusive logo diagnostics but preserves published accessory identity", () => {
  const analysis = { garment_zones: { zones: {
    logo_text_detail: { interpretation: "unknown", publication_decision: "withhold" },
    accessory_watch: { name: "Watch", identity_publication_decision: "publish", color_publication_decision: "withhold_unvalidated_color" },
  } } };
  const zones = sanitizeCustomerFacingZonesV1(analysis).garment_zones.zones;
  assert.equal(zones.logo_text_detail, undefined);
  assert.equal(zones.accessory_watch.name, "Watch");
  assert.equal(zones.accessory_watch.identity_publication_decision, "publish");
});
