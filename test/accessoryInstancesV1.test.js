import test from "node:test";
import assert from "node:assert/strict";

import { buildAccessoryInstancesV1 } from "../src/intelligence/accessoryInstancesV1.js";
import { normalizeBoundingBox } from "../src/intelligence/perceptionV5/index.js";

function evidence({
  id,
  label,
  confidence = 0.82,
  geometry,
  colors = [{
    hex: "#B88A2D",
    pct: 0.22,
    pixel_count: 14,
    source_class: "object",
    surrounding_distance: 0.18,
  }],
  source = "grounding_dino",
  accepted = true,
  supported = true,
} = {}) {
  return {
    id,
    source,
    zone: "accessory_jewelry",
    label,
    confidence,
    geometry,
    accepted,
    validation: { supported, reason: supported ? "small_object_local_pixels_validated" : "insufficient_small_object_pixel_evidence" },
    pixel_evidence: { available: true, sample_count: 64 },
    object_local_colors: colors,
  };
}

test("publishes simultaneous jewelry types as independent UI-ready zones", () => {
  const result = buildAccessoryInstancesV1({
    perceptionV6: {
      evidence_ledger: [
        evidence({ id: "n1", label: "necklace", geometry: { x: .42, y: .28, x2: .58, y2: .48 } }),
        evidence({ id: "e1", label: "earring", geometry: { x: .31, y: .16, x2: .36, y2: .23 } }),
        evidence({ id: "w1", label: "watch", geometry: { x: .72, y: .48, x2: .82, y2: .58 } }),
      ],
    },
  });

  assert.equal(result.detected_count, 3);
  assert.equal(result.zones.accessory_necklace.display_zone_label, "Necklace");
  assert.equal(result.zones.accessory_earrings.display_zone_label, "Earrings");
  assert.equal(result.zones.accessory_watch.display_zone_label, "Watch");
  assert.equal(result.color_published_count, 0);
  assert.equal(result.color_withheld_count, 3);
});

test("labels validated reflective warm jewelry pixels as measured gold tone", () => {
  const result = buildAccessoryInstancesV1({
    perceptionV6: {
      evidence_ledger: [evidence({
        id: "watch-gold",
        label: "watch",
        colors: [
          { hex: "#7D5D43", pct: .34, pixel_count: 22, source_class: "object", surrounding_distance: .16 },
          { hex: "#BEA082", pct: .31, pixel_count: 20, source_class: "object", surrounding_distance: .14 },
          { hex: "#DDC3A1", pct: .25, pixel_count: 16, source_class: "object", surrounding_distance: .12 },
        ],
      })],
    },
  });
  assert.equal(result.instances[0].material_family, "gold_tone_metal");
  assert.equal(result.instances[0].material_display_name, "Gold Tone");
  assert.equal(result.instances[0].external_color_authority, false);
});

test("normalizes Grounding DINO x_min geometry using embedded image dimensions", () => {
  const box = normalizeBoundingBox({
      bbox: { x_min: 383, y_min: 868, x_max: 406, y_max: 883, width: 23, height: 15 },
      image_dimensions: { width: 1187, height: 1600 },
    });
  assert.ok(Math.abs(box.x - 383 / 1187) < 1e-12);
  assert.ok(Math.abs(box.y - 868 / 1600) < 1e-12);
  assert.ok(Math.abs(box.width - 23 / 1187) < 1e-12);
  assert.ok(Math.abs(box.height - 15 / 1600) < 1e-12);
  assert.ok(Math.abs(box.x2 - 406 / 1187) < 1e-12);
  assert.ok(Math.abs(box.y2 - 883 / 1600) < 1e-12);
  assert.equal(box.normalized, true);
});

test("normalizes Grounding DINO x_min geometry when width and height are omitted", () => {
  const box = normalizeBoundingBox({
    bbox: { x_min: 530, y_min: 321, x_max: 629, y_max: 510 },
    image_dimensions: { width: 1187, height: 1600 },
  });
  assert.ok(Math.abs(box.width - 99 / 1187) < 1e-12);
  assert.ok(Math.abs(box.height - 189 / 1600) < 1e-12);
  assert.ok(Math.abs(box.x2 - 629 / 1187) < 1e-12);
  assert.ok(Math.abs(box.y2 - 510 / 1600) < 1e-12);
});

test("keeps spatially separate matching jewelry instances and removes overlapping duplicates", () => {
  const result = buildAccessoryInstancesV1({
    perceptionV6: {
      evidence_ledger: [
        evidence({ id: "left", label: "earrings", confidence: .91, geometry: { x: .25, y: .15, x2: .30, y2: .22 } }),
        evidence({ id: "left-duplicate", label: "earring", confidence: .74, geometry: { x: .251, y: .151, x2: .301, y2: .221 } }),
        evidence({ id: "right", label: "earring", confidence: .86, geometry: { x: .70, y: .15, x2: .75, y2: .22 } }),
      ],
    },
  });

  assert.equal(result.detected_count, 2);
  assert.deepEqual(Object.keys(result.zones), ["accessory_earrings", "accessory_earrings_2"]);
  assert.deepEqual(result.instances.flatMap((item) => item.evidence_ids), ["left", "right"]);
});

test("publishes a supported identity but withholds unisolated color", () => {
  const result = buildAccessoryInstancesV1({
    perceptionV6: {
      evidence_ledger: [evidence({
        id: "ring-1",
        label: "ring",
        colors: [{
          hex: "#B28A72",
          pct: .02,
          pixel_count: 1,
          source_class: "skin",
          surrounding_distance: .004,
        }],
      })],
    },
  });

  assert.equal(result.detected_count, 1);
  assert.equal(result.color_withheld_count, 1);
  assert.equal(result.instances[0].color_publication_decision, "withhold_unisolated_color");
  assert.equal(result.instances[0].hex, null);
  assert.deepEqual(result.instances[0].object_local_colors, []);
});

test("rejects semantic-only, low-confidence, rejected, and non-jewelry evidence", () => {
  const result = buildAccessoryInstancesV1({
    perceptionV6: {
      evidence_ledger: [
        evidence({ id: "semantic", label: "necklace", source: "openai_semantic_observer" }),
        evidence({ id: "weak", label: "ring", confidence: .31 }),
        evidence({ id: "rejected", label: "bracelet", accepted: false }),
        evidence({ id: "shirt", label: "shirt" }),
      ],
    },
  });

  assert.equal(result.detected_count, 0);
  assert.deepEqual(result.zones, {});
});
