import test from "node:test";
import assert from "node:assert/strict";

import { classifyMeasuredMetallicPaletteV1 } from "../src/intelligence/metallicColorIdentityV1.js";
import { reconcileAccessoryPublicationV1 } from "../src/intelligence/accessoryPublicationBridgeV1.js";

const WATCH_COLORS = [
  { hex: "#DDC4A0", pct: 0.09, pixel_count: 90 },
  { hex: "#BEA381", pct: 0.07, pixel_count: 70 },
  { hex: "#A08060", pct: 0.05, pixel_count: 50 },
  { hex: "#7E6142", pct: 0.05, pixel_count: 50 },
];

test("gold-tone classifier preserves highlight evidence but chooses a measured mid-tone representative", () => {
  const result = classifyMeasuredMetallicPaletteV1({
    colors: WATCH_COLORS,
    highlightRatio: 0.12,
    validationSupported: true,
  });

  assert.equal(result.publishable, true);
  assert.equal(result.family, "gold_tone_metal");
  assert.equal(result.display_name, "Gold Tone");
  assert.ok(WATCH_COLORS.some((color) => color.hex === result.representative_hex));
  assert.notEqual(result.representative_hex, "#DDC4A0");
});

test("visible watch alias receives post-ownership metallic representative instead of stale beige highlight", () => {
  const staleWatch = {
    zone_key: "watch",
    type: "watch",
    display_zone_label: "Watch",
    accessory_type: "watch",
    object_type: "watch",
    hex: "#DDC4A0",
    primary_color: WATCH_COLORS[0],
    region_colors: WATCH_COLORS,
    confidence: 0.79,
  };

  const instance = {
    instance_id: "watch_1",
    zone_key: "accessory_watch",
    type: "accessory_watch",
    display_zone_label: "Watch",
    accessory_type: "watch",
    object_type: "watch",
    label: "watch",
    confidence: 0.79,
    hex: "#DDC4A0",
    object_local_colors: WATCH_COLORS,
    metallic_color_evidence_v1: { evidence: { highlight_ratio: 0.12 } },
  };

  const analysis = {
    piece_color_ownership_v1: {
      accessory_color_authorities: [{
        id: "watch_detection",
        type: "watch",
        zone: "accessory_jewelry",
        confidence: 0.79,
        applied: true,
        dominant_hex: "#DDC4A0",
        region_colors: WATCH_COLORS,
        doctrine: "measure_validate_publish",
      }],
    },
    accessory_instances_v1: {
      instances: [instance],
      zones: { accessory_watch: instance },
    },
    garment_zones: {
      zones: { watch: staleWatch },
    },
  };

  const result = reconcileAccessoryPublicationV1(analysis);
  const published = result.garment_zones.zones.watch;

  assert.equal(published.accessory_type, "watch");
  assert.equal(published.material_family, "gold_tone_metal");
  assert.equal(published.material_display_name, "Gold Tone");
  assert.ok(WATCH_COLORS.some((color) => color.hex === published.hex));
  assert.notEqual(published.hex, "#DDC4A0");
  assert.equal(published.validation_reason, "validated_accessory_metallic_representative");
  assert.equal(result.garment_zones.accessory_publication_bridge_v1.visible_zone_matching, "normalized_accessory_identity");
});
