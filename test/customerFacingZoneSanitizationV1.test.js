import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeCustomerFacingZonesV1 } from "../src/intelligence/customerFacingZoneSanitizationV1.js";
import { getColorName as getName } from "../src/engines/labelMapper/index.js";

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

test("validated footwear ownership survives a generic low-signal read", () => {
  const analysis = {
    piece_color_ownership_v1: { accessory_color_authorities: [{
      zone: "footwear", label: "shoes", confidence: 63, applied: true,
      dominant_hex: "#0F0E10", color_authority_source: "piece_color_ownership_v1",
      region_colors: [{ hex: "#0F0E10", pct: 0.81, ownership_validated: true }],
    }] },
    garment_zones: { zones: { footwear: {
      name: "Luxury Tan", hex: null, interpretation: "unknown", confidence: 18,
    } } },
  };
  const footwear = sanitizeCustomerFacingZonesV1(analysis).garment_zones.zones.footwear;
  assert.equal(footwear.hex, "#0F0E10");
  assert.equal(footwear.name, "Graphite Black");
  assert.equal(footwear.display_label, "Graphite Black");
  assert.equal(footwear.color_identity.name, "Graphite Black");
  assert.equal(footwear.garment_identity.primary_identity.name, "Graphite Black");
  assert.equal(footwear.primary_color.name, "Graphite Black");
  assert.equal(footwear.interpretation, "single_color");
  assert.equal(footwear.publication_state, "confirmed");
  assert.equal(footwear.confidence, 63);
});

test("synchronizes head-to-toe color aliases with the authoritative primary hex", () => {
  const analysis = { garment_zones: { zones: { lower_garment: {
    name: "Graphite Black",
    display_label: "Graphite Black",
    hex: "#415242",
    interpretation: "single_color",
    color_identity: { name: "Desert Tan", translation: "Soft Earth" },
    garment_identity: { primary_identity: { name: "Graphite Black" }, secondary_identities: [] },
    primary_color: {
      hex: "#415242",
      name: "Muted Forest Green",
      color_identity: { name: "Muted Forest Green", translation: "Soft Gray" },
    },
  } } } };
  const lower = sanitizeCustomerFacingZonesV1(analysis).garment_zones.zones.lower_garment;
  assert.equal(lower.name, "Muted Forest Green");
  assert.equal(lower.display_label, "Muted Forest Green");
  assert.equal(lower.color_identity.name, "Muted Forest Green");
  assert.equal(lower.color_identity.translation, "Soft Gray");
  assert.equal(lower.garment_identity.primary_identity.name, "Muted Forest Green");
});

test("regenerates every published nested color name from its own authoritative hex", () => {
  const analysis = { garment_zones: { zones: { outerwear: {
    name: "stale zone name",
    hex: "#BE4175",
    interpretation: "single_color",
    primary_color: { hex: "#BE4175", name: "stale primary" },
    dominant_color: { hex: "#BE4175", name: "stale dominant" },
    signature_color: { hex: "#E15F9E", name: "stale signature" },
    region_colors: [{ hex: "#BE4175", name: "stale region" }],
    detected_colors: [{ hex: "#E15F9E", name: "stale detected" }],
  } } } };
  const outerwear = sanitizeCustomerFacingZonesV1(analysis).garment_zones.zones.outerwear;

  assert.equal(outerwear.name, getName("#BE4175"));
  assert.equal(outerwear.primary_color.name, getName("#BE4175"));
  assert.equal(outerwear.dominant_color.name, getName("#BE4175"));
  assert.equal(outerwear.signature_color.name, getName("#E15F9E"));
  assert.equal(outerwear.region_colors[0].name, getName("#BE4175"));
  assert.equal(outerwear.detected_colors[0].name, getName("#E15F9E"));
});

test("canonical garment authority rewrites every public alias and preserves a real owned accent", () => {
  const analysis = { garment_zones: { zones: { lower_garment: {
    name: "stale",
    hex: "#111111",
    interpretation: "single_color",
    primary_color: { hex: "#111111" },
    support_colors: [{ hex: "#FFFFFF" }],
    canonical_color_authority_v1: {
      applied: true,
      source: "exclusive_sam_mask_pixels",
      dominant_hex: "#6D7D93",
      region_colors: [
        { hex: "#6D7D93", pct: 0.84 },
        { hex: "#E15F9E", pct: 0.16 },
      ],
    },
  } } } };

  const lower = sanitizeCustomerFacingZonesV1(analysis).garment_zones.zones.lower_garment;
  assert.equal(lower.hex, "#6D7D93");
  assert.equal(lower.primary_color.hex, "#6D7D93");
  assert.equal(lower.dominant_color.hex, "#6D7D93");
  assert.deepEqual(lower.support_colors.map((color) => color.hex), ["#E15F9E"]);
  assert.deepEqual(lower.detected_colors.map((color) => color.hex), ["#6D7D93", "#E15F9E"]);
  assert.equal(lower.interpretation, "multi_color");
  assert.equal(lower.color_authority_source, "exclusive_sam_mask_pixels");
});
