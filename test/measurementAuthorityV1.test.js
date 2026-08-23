import assert from "node:assert/strict";
import test from "node:test";
import { selectMeasuredColorAuthorityV1 } from "../src/intelligence/measurementAuthorityV1.js";

test("SAM mask interior outranks DINO bbox and global palette evidence", () => {
  const result = selectMeasuredColorAuthorityV1([
    {
      hex: "#935234",
      source: "sam_mask_interior",
      ownership_state: "owned",
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
});

test("global palette cannot become garment truth even when it has the highest confidence", () => {
  const result = selectMeasuredColorAuthorityV1([
    {
      hex: "#EEE1CC",
      source: "global_palette",
      ownership_state: "outfit",
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
      pixel_count: 900,
      interior_ratio: 0.8,
      confidence: 0.94,
    },
  ]);

  assert.equal(result.selected, null);
  assert.equal(result.diagnostics[0]?.traceable_to_pixels, true);
  assert.equal(result.diagnostics[0]?.positively_owned, false);
});

test("owned interior measurement can publish when SAM is unavailable", () => {
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
});

test("reasoning cannot invent replacement hex is a permanent policy", () => {
  const result = selectMeasuredColorAuthorityV1([]);
  assert.equal(result.policy.reasoning_cannot_invent_replacement_hex, true);
  assert.equal(result.doctrine, "measure_twice_publish_once");
});
