import test from "node:test";
import assert from "node:assert/strict";
import { applyPieceColorOwnershipV1 } from "../src/intelligence/pieceColorOwnershipV1.js";

function image(width = 100, height = 100, background = "#D9D2C5") {
  const data = new Uint8Array(width * height * 4);
  const out = { width, height, data };
  paint(out, { x: 0, y: 0, width: 1, height: 1 }, background);
  return out;
}

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

function dinoRegion(id, zone, bbox, label, dominant = "#111111", confidence = 0.9) {
  return {
    id,
    zone,
    bbox,
    label,
    segment_label: label,
    source_type: "grounding_dino",
    confidence,
    dominant_hex: dominant,
    region_colors: [{ hex: dominant, pct: 0.67 }],
  };
}

test("lower garment owns green pixels after black belt and footwear are excluded", () => {
  const img = image();
  const pantsBox = { x: 0.30, y: 0.42, width: 0.40, height: 0.50 };
  const beltBox = { x: 0.28, y: 0.43, width: 0.44, height: 0.06 };
  const shoesBox = { x: 0.30, y: 0.84, width: 0.40, height: 0.14 };
  paint(img, pantsBox, "#4E604F");
  paint(img, beltBox, "#101114");
  paint(img, shoesBox, "#0D131E");

  const pants = dinoRegion("pants", "lower_garment", pantsBox, "pants", "#0D131E");
  const belt = {
    ...dinoRegion("belt", "accessory_jewelry", beltBox, "belt", "#101114"),
    object_type: "belt",
    accessory_type: "belt",
  };
  const shoes = dinoRegion("shoes", "footwear", shoesBox, "shoes", "#0D131E");

  const result = applyPieceColorOwnershipV1({ decodedImage: img, regions: [pants, belt, shoes] });
  const corrected = result.regions.find((region) => region.id === "pants");
  assert.equal(corrected.dominant_hex, "#4E604F");
  assert.equal(corrected.region_colors[0].hex, "#4E604F");
  assert.equal(corrected.color_debug.piece_color_ownership_v1.applied, true);
  assert.equal(corrected.color_debug.piece_color_ownership_v1.measurement_source, "dino_bbox_interior");
  assert.equal(corrected.color_debug.piece_color_ownership_v1.doctrine, "measure_twice_publish_once");
  assert.deepEqual(
    corrected.color_debug.piece_color_ownership_v1.ownership_claims.map((claim) => claim.piece_class).sort(),
    ["belt", "footwear"]
  );
  assert.equal(result.regions.find((region) => region.id === "belt").dominant_hex, "#101114");
  assert.equal(result.regions.find((region) => region.id === "shoes").dominant_hex, "#0D131E");
});

test("bag pixels are owned by the bag instead of contaminating an upper garment", () => {
  const img = image();
  const shirtBox = { x: 0.20, y: 0.12, width: 0.60, height: 0.48 };
  const bagBox = { x: 0.64, y: 0.24, width: 0.16, height: 0.28 };
  paint(img, shirtBox, "#60321E");
  paint(img, bagBox, "#17191D");

  const shirt = dinoRegion("shirt", "upper_garment", shirtBox, "shirt", "#17191D");
  const bag = dinoRegion("bag", "bag", bagBox, "crossbody bag", "#17191D");
  const result = applyPieceColorOwnershipV1({ decodedImage: img, regions: [shirt, bag] });
  const corrected = result.regions.find((region) => region.id === "shirt");

  assert.equal(corrected.dominant_hex, "#60321E");
  assert.equal(corrected.color_debug.piece_color_ownership_v1.ownership_claims[0].piece_class, "bag");
  assert.equal(result.regions.find((region) => region.id === "bag").dominant_hex, "#17191D");
});

test("ownership is spatial rather than color-biased: a black garment remains black after interior measurement", () => {
  const img = image();
  const pantsBox = { x: 0.30, y: 0.42, width: 0.40, height: 0.50 };
  paint(img, pantsBox, "#0D131E");
  const pants = dinoRegion("pants", "lower_garment", pantsBox, "pants", "#0D131E");

  const result = applyPieceColorOwnershipV1({ decodedImage: img, regions: [pants] });
  const measured = result.regions[0];
  assert.equal(measured.dominant_hex, "#0D131E");
  assert.equal(measured.color_debug.piece_color_ownership_v1.applied, true);
  assert.equal(measured.color_debug.piece_color_ownership_v1.measurement_source, "dino_bbox_interior");
  assert.equal(result.summary.measured_region_count, 1);
});

test("DINO garment interior measurement corrects a contaminated bbox color even with no overlapping accessory", () => {
  const img = image();
  const shirtBox = { x: 0.20, y: 0.12, width: 0.60, height: 0.48 };
  paint(img, shirtBox, "#935234");

  // Deliberately simulate an upstream broad-box/global contamination read.
  const shirt = dinoRegion("shirt", "upper_garment", shirtBox, "shirt", "#C9A778");
  const result = applyPieceColorOwnershipV1({ decodedImage: img, regions: [shirt] });
  const measured = result.regions[0];

  assert.equal(measured.dominant_hex, "#935234");
  assert.equal(measured.region_colors[0].hex, "#935234");
  assert.equal(measured.color_debug.piece_color_ownership_v1.raw_dominant_hex, "#C9A778");
  assert.equal(measured.color_debug.piece_color_ownership_v1.measurement_authority_v1.selected.hex, "#935234");
  assert.equal(result.summary.corrected_region_count, 1);
});

test("oversized accessory detections cannot carve away more than the ownership safety limit", () => {
  const img = image();
  const shirtBox = { x: 0.20, y: 0.12, width: 0.60, height: 0.48 };
  paint(img, shirtBox, "#60321E");
  const hugeBagBox = { x: 0.22, y: 0.14, width: 0.54, height: 0.42 };
  const shirt = dinoRegion("shirt", "upper_garment", shirtBox, "shirt", "#60321E");
  const falseBag = dinoRegion("bag", "bag", hugeBagBox, "bag", "#0D131E");

  const result = applyPieceColorOwnershipV1({ decodedImage: img, regions: [shirt, falseBag] });
  const measured = result.regions[0];
  assert.equal(measured.dominant_hex, "#60321E");
  assert.equal(measured.color_debug.piece_color_ownership_v1.ownership_claims.length, 0);
  assert.equal(result.summary.excluded_piece_count, 0);
});
