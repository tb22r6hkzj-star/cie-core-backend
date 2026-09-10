import assert from "node:assert/strict";
import test from "node:test";
import { selectMeasuredColorAuthorityV1 } from "../src/intelligence/measurementAuthorityV1.js";

test("validated SAM mask interior outranks DINO bbox and global palette evidence", () => {
  const result = selectMeasuredColorAuthorityV1([
    {
      hex: "#935234",
      source: "sam_mask_interior",
      ownership_state: "owned",
      ownership_validated: true,
      pixel_count: 1800,
      interior_ratio: 0.92,
      boundary_ratio: 0.08,
      confidence: 0.91,
    },
    {
      hex: "#B98563",
      source: "dino_bbox",
      ownership_state: "owned",
      pixel_count: 2400,
      interior_ratio: 0.52,
      boundary_ratio: 0.38,
      confidence: 0.88,
    },
    {
      hex: "#C9A778",
      source: "global_palette",
      ownership_state: "unknown",
      confidence: 0.99,
    },
  ]);

  assert.equal(result.selected?.hex, "#935234");
  assert.equal(result.selected?.source, "sam_mask_interior");
  assert.equal(result.policy.global_palette_can_publish_garment_truth, false);
  assert.equal(result.policy.pixel_ownership_validation_required, true);
});

test("global palette cannot become garment truth even when it has the highest confidence", () => {
  const result = selectMeasuredColorAuthorityV1([
    {
      hex: "#EEE1CC",
      source: "global_palette",
      ownership_state: "outfit",
      ownership_validated: true,
      confidence: 1,
    },
  ]);

  assert.equal(result.selected, null);
  assert.equal(result.publishable.length, 0);
});

test("unowned measured pixels remain diagnostic and cannot publish", () => {
  const result = selectMeasuredColorAuthorityV1([
    {
      hex: "#3F5041",
      source: "dino_bbox_interior",
      ownership_state: "unknown",
      ownership_validated: true,
      pixel_count: 900,
      interior_ratio: 0.8,
      confidence: 0.94,
    },
  ]);

  assert.equal(result.selected, null);
  assert.equal(result.diagnostics[0]?.traceable_to_pixels, true);
  assert.equal(result.diagnostics[0]?.positively_owned, false);
});

test("owned DINO interior measurement cannot publish without independent ownership validation", () => {
  const result = selectMeasuredColorAuthorityV1([
    {
      hex: "#3F5041",
      source: "dino_bbox_interior",
      ownership_state: "owned",
      pixel_count: 1200,
      interior_ratio: 0.84,
      boundary_ratio: 0.1,
      confidence: 0.86,
    },
  ]);

  assert.equal(result.selected, null);
  assert.equal(result.publishable.length, 0);
  assert.equal(result.diagnostics[0]?.traceable_to_pixels, true);
  assert.equal(result.diagnostics[0]?.positively_owned, true);
  assert.equal(result.diagnostics[0]?.ownership_validated, false);
});

test("validated owned interior measurement can publish when its pixel ownership is proven", () => {
  const result = selectMeasuredColorAuthorityV1([
    {
      hex: "#3F5041",
      source: "dino_bbox_interior",
      ownership_state: "owned",
      ownership_validation: { status: "validated", validator: "pixel_membership_v1" },
      pixel_count: 1200,
      interior_ratio: 0.84,
      boundary_ratio: 0.1,
      confidence: 0.86,
    },
    {
      hex: "#151515",
      source: "dino_bbox",
      ownership_state: "owned",
      pixel_count: 1500,
      interior_ratio: 0.45,
      boundary_ratio: 0.42,
      confidence: 0.9,
    },
  ]);

  assert.equal(result.selected?.hex, "#3F5041");
  assert.equal(result.selected?.source, "dino_bbox_interior");
  assert.equal(result.selected?.ownership_validated, true);
});

test("reasoning cannot invent replacement hex is a permanent policy", () => {
  const result = selectMeasuredColorAuthorityV1([]);
  assert.equal(result.policy.reasoning_cannot_invent_replacement_hex, true);
  assert.equal(result.policy.provenance_alone_cannot_validate_accuracy, true);
  assert.equal(result.policy.detector_box_alone_cannot_validate_ownership, true);
  assert.equal(result.policy.unvalidated_measurements_must_abstain, true);
  assert.equal(result.doctrine, "measure_twice_publish_once");
});

test("equivalent pale footwear clusters merge and largest owned mass wins within its authority tier", () => {
  const result = selectMeasuredColorAuthorityV1([
    { hex: "#A3A09F", pct: 0.19, pixel_count: 190, source: "owned_interior_pixels", ownership_state: "owned", ownership_validated: true, confidence: 0.8 },
    { hex: "#C3BEC0", pct: 0.34, pixel_count: 340, source: "owned_interior_pixels", ownership_state: "owned", ownership_validated: true, confidence: 0.8 },
    { hex: "#C0BBBB", pct: 0.13, pixel_count: 130, source: "owned_interior_pixels", ownership_state: "owned", ownership_validated: true, confidence: 0.8 },
    { hex: "#7D8796", pct: 0.14, pixel_count: 140, source: "owned_interior_pixels", ownership_state: "owned", ownership_validated: true, confidence: 0.8 },
  ]);

  assert.equal(result.selected?.hex, "#C3BEC0");
  assert.ok(result.selected?.merged_measurement_count >= 2);
  assert.ok(result.selected?.pixel_count >= 470);
  assert.equal(result.policy.largest_owned_pixel_mass_wins_within_authority_tier, true);
});
