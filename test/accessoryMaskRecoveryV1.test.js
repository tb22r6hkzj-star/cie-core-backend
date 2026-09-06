import test from "node:test";
import assert from "node:assert/strict";
import { applyAccessoryMaskRecoveryV1 } from "../src/intelligence/accessoryMaskRecoveryV1.js";

function watchRegion() {
  return {
    id: "watch_1",
    zone: "accessory_jewelry",
    label: "gold watch",
    accessory_type: "watch",
    bbox: { x: 0.4, y: 0.4, width: 0.1, height: 0.1 },
    positive_accessory_mask_v1: { validated: false, reason: "target_conditioned_positive_accessory_mask_required" },
    accessory_semantic_exclusions_v2: [
      { type: "skin", confidence: 0.95, bbox: { x: 0.35, y: 0.35, width: 0.03, height: 0.03 } },
    ],
  };
}

function samMask(overrides = {}) {
  return {
    id: "sam_watch",
    source_type: "sam_segment",
    confidence: 0.88,
    mask_url: "https://example.test/watch-mask.png",
    mask_geometry: { bbox: { x: 0.415, y: 0.415, width: 0.07, height: 0.07 } },
    region_colors: [
      { hex: "#C9A765", pct: 0.78, pixel_count: 22 },
      { hex: "#8A6327", pct: 0.18, pixel_count: 6 },
    ],
    ...overrides,
  };
}

test("recovers a compact clean watch mask rejected by the strict first pass", () => {
  const result = applyAccessoryMaskRecoveryV1([watchRegion()], [samMask()]);
  const watch = result.regions[0];
  assert.equal(watch.positive_accessory_mask_v1.validated, true);
  assert.equal(watch.positive_accessory_mask_v1.recovery_source, "accessory_mask_recovery_v1");
  assert.equal(watch.accessory_mask_recovery_v1.recovered, true);
  assert.equal(watch.accessory_positive_mask_colors[0].hex, "#C9A765");
  assert.equal(result.summary.recovered_count, 1);
});

test("recovers a small well-contained true-crop mask with independently counted pixels", () => {
  const region = watchRegion();
  region.bbox = { x: 0.62616, y: 0.409948, width: 0.073448, height: 0.040144 };
  region.accessory_semantic_exclusions_v2 = [];
  const mask = samMask({
    micro_crop_mask_v1: true,
    mask_geometry: {
      bbox: { x: 0.647347, y: 0.438622, w: 0.009887, h: 0.003186 },
      pixel_count: 26,
      fill_ratio: 0.743,
      image_edge_ratio: 0,
    },
    region_colors: [
      { hex: "#C0AC93", pct: 0.46 },
      { hex: "#9C8A71", pct: 0.31 },
      { hex: "#83735E", pct: 0.23 },
    ],
  });
  const result = applyAccessoryMaskRecoveryV1([region], [mask]);
  assert.equal(result.regions[0].positive_accessory_mask_v1.validated, true);
  assert.equal(result.regions[0].accessory_mask_recovery_v1.pixel_count, 26);
  assert.ok(result.regions[0].accessory_positive_mask_colors.every((color) => color.pixel_count >= 1));
  assert.ok(result.regions[0].accessory_positive_mask_colors.every((color) => color.measurement_source === "accessory_positive_mask_pixels"));
});

test("rejects a true-crop mask that touches the crop edge", () => {
  const mask = samMask({
    micro_crop_mask_v1: true,
    mask_geometry: {
      bbox: { x: 0.415, y: 0.415, width: 0.01, height: 0.01 },
      pixel_count: 30,
      fill_ratio: 0.8,
      image_edge_ratio: 0.4,
    },
    region_colors: [{ hex: "#C9A765", pct: 1 }],
  });
  const result = applyAccessoryMaskRecoveryV1([watchRegion()], [mask]);
  assert.equal(result.regions[0].accessory_mask_recovery_v1.recovered, false);
  assert.equal(result.regions[0].accessory_mask_recovery_v1.reason, "skin_contamination");
});

test("does not recover a broad wrist-like mask", () => {
  const broad = samMask({
    id: "sam_wrist",
    mask_geometry: { bbox: { x: 0.36, y: 0.36, width: 0.16, height: 0.16 } },
  });
  const result = applyAccessoryMaskRecoveryV1([watchRegion()], [broad]);
  const watch = result.regions[0];
  assert.notEqual(watch?.positive_accessory_mask_v1?.validated, true);
  assert.equal(watch.accessory_mask_recovery_v1.recovered, false);
  assert.equal(watch.accessory_mask_recovery_v1.reason, "low_target_overlap");
  assert.equal(result.summary.recovered_count, 0);
});

test("does not recover skin-contaminated mask", () => {
  const region = watchRegion();
  region.accessory_semantic_exclusions_v2 = [
    { type: "skin", confidence: 0.99, bbox: { x: 0.42, y: 0.42, width: 0.05, height: 0.05 } },
  ];
  const result = applyAccessoryMaskRecoveryV1([region], [samMask()]);
  const watch = result.regions[0];
  assert.notEqual(watch?.positive_accessory_mask_v1?.validated, true);
  assert.equal(watch.accessory_mask_recovery_v1.reason, "skin_contamination");
});

test("reports insufficient usable pixels instead of inventing accessory color", () => {
  const weakPixels = samMask({ region_colors: [{ hex: "#C9A765", pct: 1, pixel_count: 4 }] });
  const result = applyAccessoryMaskRecoveryV1([watchRegion()], [weakPixels]);
  const watch = result.regions[0];
  assert.equal(watch.accessory_mask_recovery_v1.recovered, false);
  assert.equal(watch.accessory_mask_recovery_v1.reason, "insufficient_usable_pixels");
  assert.deepEqual(watch.accessory_positive_mask_colors, []);
});

test("reports no_mask when no usable recovery segment exists", () => {
  const result = applyAccessoryMaskRecoveryV1([watchRegion()], []);
  assert.equal(result.regions[0].accessory_mask_recovery_v1.reason, "no_mask");
  assert.equal(result.summary.failure_reasons.no_mask, 1);
});

test("preserves already validated masks without a recovery attempt", () => {
  const region = watchRegion();
  region.positive_accessory_mask_v1 = { validated: true, reason: "target_conditioned_sam_positive_mask" };
  const result = applyAccessoryMaskRecoveryV1([region], [samMask()]);
  assert.equal(result.regions[0].accessory_mask_recovery_v1, undefined);
  assert.equal(result.summary.attempted_count, 0);
});
