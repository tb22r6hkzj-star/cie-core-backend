import test from "node:test";
import assert from "node:assert/strict";
import { buildPublishedGarmentZonesV2 } from "../src/intelligence/publishedGarmentZonesV2.js";

test("published garment color name follows the authoritative enriched primary", () => {
  const result = buildPublishedGarmentZonesV2({
    zones: { upper_garment: { name: "Muted Forest Green", hex: "#526354" } },
  }, {
    upper_garment: {
      name: "Muted Forest Green",
      hex: "#9B5839",
      primary_color: { hex: "#9B5839", name: "Rich Brown", pct: 1 },
    },
  });
  assert.equal(result.zones.upper_garment.name, "Rich Brown");
  assert.equal(result.zones.upper_garment.hex, "#9B5839");
});

test("published garment zones use enriched lower-garment authority over stale raw black", () => {
  const legacy = {
    version: "garment_zone_v3",
    zones: {
      lower_garment: {
        hex: "#0D131E",
        dominant_color: { hex: "#0D131E", pct: 0.67 },
        primary_color: { hex: "#0D131E", pct: 0.67 },
        region_colors: [
          { hex: "#0D131E", pct: 0.67 },
          { hex: "#4E604F", pct: 0.01 },
        ],
      },
      footwear: { hex: "#111111", dominant_color: { hex: "#111111" } },
    },
    segmented_regions: [{ id: "pants-1" }],
  };

  const enriched = {
    lower_garment: {
      ...legacy.zones.lower_garment,
      hex: "#4E604F",
      dominant_color: { hex: "#4E604F", pct: 0.01 },
      primary_color: { hex: "#4E604F", pct: 0.01 },
      color_publication_v3: {
        action: "publish_v3",
        source: "color_evidence_v3_fusion",
        hex: "#4E604F",
        applied_to_zone: true,
      },
    },
  };

  const result = buildPublishedGarmentZonesV2(legacy, enriched);

  assert.equal(result.zones.lower_garment.hex, "#4E604F");
  assert.equal(result.zones.lower_garment.dominant_color.hex, "#4E604F");
  assert.equal(result.zones.lower_garment.primary_color.hex, "#4E604F");
  assert.equal(result.zones.footwear.hex, "#111111");
  assert.deepEqual(result.segmented_regions, legacy.segmented_regions);
  assert.equal(result.publication_authority, "color_evidence_v3_enriched_zones");
});

test("published garment zones do not mutate the pre-enrichment zone objects", () => {
  const legacy = {
    zones: {
      lower_garment: {
        hex: "#0D131E",
        dominant_color: { hex: "#0D131E" },
      },
    },
  };
  const enriched = {
    lower_garment: {
      hex: "#4E604F",
      dominant_color: { hex: "#4E604F" },
    },
  };

  const result = buildPublishedGarmentZonesV2(legacy, enriched);
  result.zones.lower_garment.dominant_color.hex = "#FFFFFF";

  assert.equal(legacy.zones.lower_garment.dominant_color.hex, "#0D131E");
  assert.equal(enriched.lower_garment.dominant_color.hex, "#4E604F");
});
