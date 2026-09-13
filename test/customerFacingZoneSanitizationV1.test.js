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
  assert.equal(footwear.publication_state, "possible");
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

test("derived garment cards use the same authoritative hex and regenerated name as the published zone", () => {
  const staleItem = {
    type: "outerwear",
    display_label: "Muted Lip Rose",
    primary_color: { hex: "#BE4175", name: "Muted Lip Rose", pct: 0.73 },
    dominant_color: { hex: "#BE4175", name: "Muted Lip Rose", pct: 0.73 },
    signature_color: { hex: "#BE4175", name: "Muted Lip Rose" },
    detected_colors: [{ hex: "#E15F9E", name: "Dusty Rose", pct: 0.73 }],
    garment_identity: { primary_identity: { name: "Muted Lip Rose" } },
  };
  const analysis = {
    garment_zones: { zones: { outerwear: {
      name: "stale zone name",
      hex: "#E15F9E",
      interpretation: "single_color",
      primary_color: { hex: "#E15F9E", name: "stale primary", pct: 0.73 },
      dominant_color: { hex: "#E15F9E", name: "stale dominant", pct: 0.73 },
      signature_color: { hex: "#E15F9E", name: "stale signature" },
      detected_colors: [{ hex: "#E15F9E", name: "stale detected", pct: 0.73 }],
    } } },
    garment_analysis: { detected_items: [staleItem] },
    material_analysis: { detected_items: [staleItem] },
  };

  const sanitized = sanitizeCustomerFacingZonesV1(analysis);
  for (const collection of [sanitized.garment_analysis.detected_items, sanitized.material_analysis.detected_items]) {
    const outerwear = collection[0];
    assert.equal(outerwear.display_label, "Vivid Pink");
    assert.equal(outerwear.primary_color.hex, "#E15F9E");
    assert.equal(outerwear.primary_color.name, "Vivid Pink");
    assert.equal(outerwear.dominant_color.name, "Vivid Pink");
    assert.equal(outerwear.signature_color.name, "Vivid Pink");
    assert.equal(outerwear.detected_colors[0].name, "Vivid Pink");
    assert.equal(outerwear.garment_identity.primary_identity.name, "Vivid Pink");
  }
});

test("layered garments keep sibling-owned colors out of the upper-garment palette", () => {
  const analysis = { garment_zones: { zones: {
    upper_garment: {
      hex: "#EFEDEE", interpretation: "multi_color",
      primary_color: { hex: "#EFEDEE", pct: 0.83 },
      support_colors: [
        { hex: "#DB5A97", pct: 0.49 },
        { hex: "#B63768", pct: 0.32 },
        { hex: "#4C5A6C", pct: 0.05 },
        { hex: "#BB8568", pct: 0.04 },
      ],
      detected_colors: [{ hex: "#EFEDEE", pct: 0.83 }, { hex: "#DB5A97", pct: 0.49 }],
    },
    lower_garment: {
      hex: "#6F7E91", interpretation: "single_color", primary_color: { hex: "#6F7E91", pct: 0.39 },
    },
    outerwear: {
      hex: "#E1609E", interpretation: "single_color", primary_color: { hex: "#E1609E", pct: 0.47 },
    },
  } } };

  const upper = sanitizeCustomerFacingZonesV1(analysis).garment_zones.zones.upper_garment;
  assert.equal(upper.name, "Soft White");
  assert.equal(upper.interpretation, "single_color");
  assert.deepEqual(upper.support_colors, []);
  assert.deepEqual(upper.detected_colors.map((color) => color.hex), ["#EFEDEE"]);
  assert.equal(upper.layered_ownership_reconciliation_v1.applied, true);
});

test("withholds a broad upper read when an outer layer exists but the inner layer has no independent mask", () => {
  const analysis = {
    semantic_scene_graph_v1: { pieces: [
      { zone: "upper_garment", layer_role: "inner", confidence: .96 },
      { zone: "outerwear", layer_role: "outer", confidence: .98 },
    ] },
    garment_zones: { zones: { upper_garment: {
      hex: "#CC3534",
      interpretation: "single_color",
      publication_decision: "publish",
      primary_color: { hex: "#CC3534", source: "dino_interior" },
    } } },
  };
  const upper = sanitizeCustomerFacingZonesV1(analysis).garment_zones.zones.upper_garment;
  assert.equal(upper.publication_state, "unknown");
  assert.equal(upper.hex, null);
  assert.equal(upper.validation_reason, "outer_layer_present_without_independent_inner_mask");
});

test("keeps an independently masked inner garment under outerwear", () => {
  const analysis = {
    semantic_scene_graph_v1: { pieces: [
      { zone: "upper_garment", layer_role: "inner", confidence: .96 },
      { zone: "outerwear", layer_role: "outer", confidence: .98 },
    ] },
    garment_zones: { zones: { upper_garment: {
      hex: "#EFEDEE",
      interpretation: "single_color",
      publication_decision: "publish",
      primary_color: { hex: "#EFEDEE", source: "exclusive_mask_pixel_membership" },
    } } },
  };
  const upper = sanitizeCustomerFacingZonesV1(analysis).garment_zones.zones.upper_garment;
  assert.equal(upper.hex, "#EFEDEE");
  assert.equal(upper.name, "Soft White");
});

test("published cards expose calibrated confidence instead of a stale legacy zero", () => {
  const staleItem = { type: "outerwear", confidence: 0, primary_color: { hex: "#E1609E" } };
  const analysis = {
    garment_zones: { zones: { outerwear: {
      hex: "#E1609E", interpretation: "single_color", confidence: 0,
      unified_confidence: 74, calibrated_confidence: 74,
      primary_color: { hex: "#E1609E", pct: 0.47 },
    } } },
    garment_analysis: { detected_items: [staleItem] },
  };

  const sanitized = sanitizeCustomerFacingZonesV1(analysis);
  assert.equal(sanitized.garment_zones.zones.outerwear.confidence, 74);
  assert.equal(sanitized.garment_analysis.detected_items[0].confidence, 74);
});

test("restored color authority cannot label low-confidence evidence confirmed", () => {
  const analysis = sanitizeCustomerFacingZonesV1({
    garment_zones: { zones: {
      footwear: {
        confidence: 14,
        interpretation: "single_color",
        publication_decision: "publish",
        primary_color: { hex: "#A3A3A3" },
      },
    } },
    piece_color_ownership_v1: { accessory_color_authorities: [{
      zone: "footwear", applied: true, confidence: 14, dominant_hex: "#EFEDEE",
      region_colors: [{ hex: "#EFEDEE", pct: 1 }],
    }] },
  });
  assert.equal(analysis.garment_zones.zones.footwear.publication_state, "unknown");
  assert.notEqual(analysis.garment_zones.zones.footwear.publication_state, "confirmed");
});

test("restored ownership normalizes mixed confidence scales before publication", () => {
  const analysis = sanitizeCustomerFacingZonesV1({
    garment_zones: { zones: { footwear: {
      confidence: 14,
      interpretation: "single_color",
      primary_color: { hex: "#EFEDEE" },
    } } },
    piece_color_ownership_v1: { accessory_color_authorities: [{
      zone: "footwear", applied: true, confidence: 0.97, dominant_hex: "#EFEDEE",
      region_colors: [{ hex: "#EFEDEE", pct: 1 }],
    }] },
  });
  const footwear = analysis.garment_zones.zones.footwear;
  assert.equal(footwear.confidence, 97);
  assert.equal(footwear.publication_state, "confirmed");
});

test("red white pink layered outfit publishes jacket and shirt under their semantic zone identities", () => {
  const color = (hex, pct, ownership_validated = true) => ({ hex, pct, ownership_validated });
  const analysis = sanitizeCustomerFacingZonesV1({
    semantic_scene_graph_v1: { pieces: [
      { piece: "jacket", subtype: "track jacket", zone: "outerwear", layer_role: "outer", confidence: .98 },
      { piece: "shirt", subtype: "shirt", zone: "upper_garment", layer_role: "inner", confidence: .97 },
      { piece: "shorts", subtype: "shorts", zone: "lower_garment", layer_role: "standalone", confidence: .98 },
      { piece: "footwear", subtype: "low top athletic sneaker", zone: "footwear", layer_role: "standalone", confidence: .96 },
    ] },
    garment_zones: { zones: {
      upper_garment: {
        interpretation: "multi_color", primary_color: color("#F5F1FB", .17),
        detected_colors: [color("#F5F1FB", .17), color("#C22E2E", .15), color("#DEB3CB", .12)],
      },
      body_garment: {
        interpretation: "single_color", primary_color: color("#F5F1FB", .54),
        detected_colors: [color("#F5F1FB", .54)],
      },
      lower_garment: {
        interpretation: "multi_color", primary_color: color("#F0ECF4", .20),
        detected_colors: [color("#F0ECF4", .20), color("#C02E2E", .08), color("#E2AFC8", .07)],
      },
      footwear: {
        interpretation: "multi_color", color_mode: "single_color", mode: "single_color",
        primary_color: color("#DEB3CB", .31),
        detected_colors: [color("#DEB3CB", .31), color("#E1D2DD", .05), color("#D53A45", .04)],
      },
    } },
  });
  const zones = analysis.garment_zones.zones;
  assert.equal(zones.body_garment, undefined);
  assert.equal(zones.outerwear.display_zone_label, "Track Jacket");
  assert.deepEqual(zones.outerwear.detected_colors.map((row) => row.hex), ["#F5F1FB", "#C22E2E", "#DEB3CB"]);
  assert.equal(zones.upper_garment.display_zone_label, "Shirt");
  assert.equal(zones.upper_garment.color_mode, "single_color");
  assert.equal(zones.lower_garment.display_zone_label, "Shorts");
  assert.deepEqual(zones.lower_garment.detected_colors.map((row) => row.hex), ["#F0ECF4", "#C02E2E", "#E2AFC8"]);
  assert.equal(zones.footwear.display_zone_label, "Low Top Athletic Sneaker");
  assert.equal(zones.footwear.color_mode, "multicolor");
  assert.equal(zones.footwear.mode, "multicolor");
  assert.equal(zones.footwear.read_mode, "multicolor");
  assert.ok(zones.footwear.detected_colors.some((row) => row.hex === "#D53A45"));
});

test("dominant black eyewear cannot publish distant unowned clothing colors", () => {
  const analysis = sanitizeCustomerFacingZonesV1({
    garment_zones: { zones: { eyewear: {
      interpretation: "single_color",
      primary_color: { hex: "#1E0D11", pct: .82, ownership_validated: true },
      detected_colors: [
        { hex: "#1E0D11", pct: .82, ownership_validated: true },
        { hex: "#5F4140", pct: .13 },
        { hex: "#9E6A63", pct: .01 },
        { hex: "#BBB1CE", pct: .01 },
      ],
    } } },
  });
  const eyewear = analysis.garment_zones.zones.eyewear;
  assert.deepEqual(eyewear.detected_colors.map((row) => row.hex), ["#1E0D11"]);
  assert.deepEqual(eyewear.secondary_colors, []);
  assert.equal(eyewear.color_mode, "single_color");
  assert.equal(eyewear.mode, "single_color");
});
