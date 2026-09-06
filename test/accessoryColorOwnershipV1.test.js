import test from "node:test";
import assert from "node:assert/strict";
import { applyPieceColorOwnershipV1 } from "../src/intelligence/pieceColorOwnershipV1.js";

function rgb(hex) {
  const value = hex.replace("#", "");
  return [0, 2, 4].map((i) => Number.parseInt(value.slice(i, i + 2), 16));
}

function paint(img, box, hex) {
  const [r, g, b] = rgb(hex);
  const x0 = Math.max(0, Math.floor(box.x * img.width));
  const y0 = Math.max(0, Math.floor(box.y * img.height));
  const x1 = Math.min(img.width, Math.ceil((box.x + box.width) * img.width));
  const y1 = Math.min(img.height, Math.ceil((box.y + box.height) * img.height));
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const i = (y * img.width + x) * 4;
      img.data[i] = r;
      img.data[i + 1] = g;
      img.data[i + 2] = b;
      img.data[i + 3] = 255;
    }
  }
}

function image(width = 160, height = 160, background = "#D3B292") {
  const data = new Uint8Array(width * height * 4);
  const out = { width, height, data };
  paint(out, { x: 0, y: 0, width: 1, height: 1 }, background);
  return out;
}

function dinoRegion(id, zone, bbox, label, dominant, confidence = 0.9, regionColors = null) {
  return {
    id,
    zone,
    bbox,
    label,
    segment_label: label,
    source_type: "grounding_dino",
    confidence,
    dominant_hex: dominant,
    region_colors: regionColors || [{ hex: dominant, pct: 1 }],
  };
}

test("stable nested footwear interior corrects a contaminated detector-box dominant", () => {
  const img = image();
  const shoeBox = { x: 0.20, y: 0.62, width: 0.58, height: 0.22 };
  paint(img, shoeBox, "#496247");
  paint(img, { x: 0.28, y: 0.655, width: 0.42, height: 0.15 }, "#101114");

  const shoe = dinoRegion(
    "shoe",
    "footwear",
    shoeBox,
    "black horsebit loafer",
    "#496247",
    0.94,
    [
      { hex: "#496247", pct: 0.44 },
      { hex: "#101114", pct: 0.23 },
      { hex: "#513C30", pct: 0.17 },
      { hex: "#7F7164", pct: 0.06 },
    ]
  );

  const result = applyPieceColorOwnershipV1({ decodedImage: img, regions: [shoe] });
  const corrected = result.regions[0];
  assert.equal(corrected.dominant_hex, "#101114");
  assert.equal(corrected.color_debug.piece_color_ownership_v1.applied, true);
  assert.equal(corrected.color_debug.piece_color_ownership_v1.target_type, "accessory");
  assert.equal(corrected.color_debug.piece_color_ownership_v1.measurement_source, "owned_interior_pixels");
  assert.equal(corrected.color_debug.piece_color_ownership_v1.accessory_ownership_validators[0].validated, true);
  assert.ok(corrected.region_colors.every((color) => color.ownership_validated === true));
  assert.equal(result.summary.validated_accessory_region_count, 1);
});

test("validated positive jewelry mask replaces surrounding skin contamination and keeps the palette compact", () => {
  const img = image();
  const watchBox = { x: 0.48, y: 0.40, width: 0.22, height: 0.22 };
  paint(img, watchBox, "#C58C59");
  paint(img, { x: 0.535, y: 0.455, width: 0.11, height: 0.11 }, "#C9A765");

  const watch = {
    ...dinoRegion(
      "watch",
      "accessory_jewelry",
      watchBox,
      "gold watch",
      "#D8B38E",
      0.91,
      [
        { hex: "#D8B38E", pct: 0.55 },
        { hex: "#C9A765", pct: 0.18 },
        { hex: "#8E684A", pct: 0.14 },
        { hex: "#6C5748", pct: 0.13 },
      ]
    ),
    object_type: "watch",
    accessory_type: "watch",
    positive_accessory_mask_v1: {
      version: "accessory_positive_mask_ownership_v2",
      validated: true,
      reason: "target_conditioned_sam_positive_mask",
      confidence: 0.92,
      sam_region_id: "watch_mask",
      target_overlap_ratio: 0.88,
      mask_overlap_ratio: 0.94,
    },
    accessory_positive_mask_colors: [
      { hex: "#C9A765", pct: 0.84, pixel_count: 66 },
      { hex: "#8E684A", pct: 0.16, pixel_count: 13 },
    ],
  };

  const result = applyPieceColorOwnershipV1({ decodedImage: img, regions: [watch] });
  const corrected = result.regions[0];
  assert.equal(corrected.dominant_hex, "#C9A765");
  assert.equal(corrected.color_debug.piece_color_ownership_v1.applied, true);
  assert.equal(corrected.color_debug.piece_color_ownership_v1.doctrine, "positive_mask_membership_precedes_jewelry_color");
  assert.ok(corrected.region_colors.length <= 2);
  assert.equal(corrected.region_colors[0].measurement_source, "accessory_positive_mask_pixels");
  assert.equal(corrected.color_debug.piece_color_ownership_v1.accessory_ownership_validators[0].validated, true);
});

test("validated watch mask supplies independent ownership at the mask-backed confidence floor", () => {
  const img = image();
  const watch = {
    ...dinoRegion("targeted-watch", "accessory_jewelry", { x: 0.62, y: 0.41, width: 0.07, height: 0.04 }, "watch", null, 0.49, []),
    object_type: "watch",
    accessory_type: "watch",
    positive_accessory_mask_v1: {
      validated: true,
      reason: "recovered_target_conditioned_sam_mask",
      confidence: 0.7,
      sam_region_id: "sam-watch",
      target_overlap_ratio: 0.013,
      mask_overlap_ratio: 1,
    },
    accessory_positive_mask_colors: [
      { hex: "#C0AC93", pct: 0.6, pixel_count: 8 },
      { hex: "#9C8A71", pct: 0.4, pixel_count: 6 },
    ],
  };
  const result = applyPieceColorOwnershipV1({ decodedImage: img, regions: [watch] });
  assert.equal(result.regions[0].color_debug.piece_color_ownership_v1.applied, true);
  assert.equal(result.regions[0].dominant_hex, "#C0AC93");
  assert.equal(result.regions[0].color_debug.piece_color_ownership_v1.doctrine, "positive_mask_membership_precedes_jewelry_color");
});

test("tiny jewelry still requires the higher mask-backed detector floor", () => {
  const img = image();
  const earring = {
    ...dinoRegion("targeted-earring", "accessory_jewelry", { x: 0.5, y: 0.09, width: 0.02, height: 0.015 }, "stud earring", null, 0.49, []),
    object_type: "earrings",
    accessory_type: "earrings",
    positive_accessory_mask_v1: { validated: true, confidence: 0.8, sam_region_id: "sam-earring" },
    accessory_positive_mask_colors: [{ hex: "#D9D9D6", pct: 1, pixel_count: 12 }],
  };
  const result = applyPieceColorOwnershipV1({ decodedImage: img, regions: [earring] });
  assert.equal(result.regions[0].color_debug.piece_color_ownership_v1.applied, false);
  assert.equal(result.regions[0].color_debug.piece_color_ownership_v1.reason, "accessory_confidence_too_low");
});

test("low-confidence accessory abstains and preserves the original evidence", () => {
  const img = image();
  const earringBox = { x: 0.44, y: 0.12, width: 0.08, height: 0.08 };
  paint(img, earringBox, "#D9D9D6");
  const earring = dinoRegion("earring", "accessory_jewelry", earringBox, "stud earring", "#1E1D22", 0.42);

  const result = applyPieceColorOwnershipV1({ decodedImage: img, regions: [earring] });
  const measured = result.regions[0];
  assert.equal(measured.dominant_hex, "#1E1D22");
  assert.equal(measured.color_debug.piece_color_ownership_v1.applied, false);
  assert.equal(measured.color_debug.piece_color_ownership_v1.reason, "accessory_confidence_too_low");
  assert.equal(result.summary.accessory_abstention_count, 1);
});
