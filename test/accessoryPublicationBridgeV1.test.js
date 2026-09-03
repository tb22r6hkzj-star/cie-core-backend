import test from "node:test";
import assert from "node:assert/strict";
import { reconcileAccessoryPublicationV1 } from "../src/intelligence/accessoryPublicationBridgeV1.js";

function watchInstance(hex = "#DDC4A0") {
  return {
    instance_id: "watch_1",
    zone_key: "accessory_watch",
    type: "accessory_watch",
    accessory_type: "watch",
    object_type: "watch",
    label: "watch",
    hex,
    dominant_color: { hex, pct: 0.09 },
    object_local_colors: [{ hex, pct: 0.09 }],
    support_colors: [{ hex: "#BEA381", pct: 0.07 }],
    color_publication_decision: "publish_object_local_color",
  };
}

function analysisWith(region, instance = watchInstance()) {
  return {
    segmented_regions: [region],
    accessory_instances_v1: {
      version: "accessory_instances_v1",
      instances: [instance],
      zones: { accessory_watch: instance },
    },
    garment_zones: {
      zones: { accessory_watch: instance },
      accessory_instances: [instance],
      segmented_regions: [region],
    },
  };
}

test("validated accessory ownership replaces stale watch palette at publication", () => {
  const region = {
    id: "watch_detection",
    zone: "accessory_jewelry",
    label: "watch",
    accessory_type: "watch",
    confidence: 0.91,
    dominant_hex: "#C69B43",
    region_colors: [
      { hex: "#C69B43", pct: 0.78, pixel_count: 48 },
      { hex: "#8A6327", pct: 0.14, pixel_count: 9 },
    ],
    color_debug: {
      piece_color_ownership_v1: {
        applied: true,
        authority: "nested_accessory_interior_stability",
      },
    },
  };

  const result = reconcileAccessoryPublicationV1(analysisWith(region));
  const instance = result.accessory_instances_v1.instances[0];
  assert.equal(instance.hex, "#C69B43");
  assert.equal(instance.dominant_color.hex, "#C69B43");
  assert.equal(instance.object_local_colors.length, 2);
  assert.equal(instance.color_authority_source, "piece_color_ownership_v1");
  assert.equal(instance.stale_accessory_palette_suppressed, false);
  assert.equal(result.garment_zones.zones.accessory_watch.hex, "#C69B43");
});

test("failed accessory ownership withholds stale watch color instead of publishing it", () => {
  const region = {
    id: "watch_detection",
    zone: "accessory_jewelry",
    label: "watch",
    accessory_type: "watch",
    confidence: 0.79,
    dominant_hex: "#DDC4A0",
    region_colors: [{ hex: "#DDC4A0", pct: 0.09 }],
    color_debug: {
      piece_color_ownership_v1: {
        applied: false,
        reason: "accessory_interior_color_unstable",
      },
    },
  };

  const result = reconcileAccessoryPublicationV1(analysisWith(region));
  const instance = result.accessory_instances_v1.instances[0];
  assert.equal(instance.hex, null);
  assert.equal(instance.dominant_color, null);
  assert.deepEqual(instance.object_local_colors, []);
  assert.equal(instance.color_publication_decision, "withhold_unvalidated_color");
  assert.equal(instance.validation_reason, "accessory_interior_color_unstable");
  assert.equal(instance.stale_accessory_palette_suppressed, true);
  assert.equal(result.garment_zones.zones.accessory_watch.hex, null);
});

test("unrelated accessories remain unchanged when there is no ownership verdict", () => {
  const earring = {
    instance_id: "earrings_1",
    zone_key: "accessory_earrings",
    accessory_type: "earrings",
    label: "earrings",
    hex: "#D9D9D9",
  };
  const result = reconcileAccessoryPublicationV1({
    segmented_regions: [{
      id: "watch_detection",
      zone: "accessory_jewelry",
      label: "watch",
      color_debug: { piece_color_ownership_v1: { applied: true } },
      dominant_hex: "#C69B43",
      region_colors: [{ hex: "#C69B43", pct: 1 }],
    }],
    accessory_instances_v1: { instances: [earring], zones: { accessory_earrings: earring } },
    garment_zones: { zones: { accessory_earrings: earring }, accessory_instances: [earring] },
  });
  assert.equal(result.accessory_instances_v1.instances[0].hex, "#D9D9D9");
});
