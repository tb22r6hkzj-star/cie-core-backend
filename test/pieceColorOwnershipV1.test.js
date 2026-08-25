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

function samRegion(id, zone, bbox, label, colors, confidence = 0.9) {
  return {
    id,
    zone,
    segment_label: label,
    source_type: "sam_segment",
    confidence,
    mask_url: `https://example.test/${id}.png`,
    mask_geometry: {
      bbox: { x: bbox.x, y: bbox.y, w: bbox.width, h: bbox.height },
      coverage: bbox.width * bbox.height,
    },
    dominant_hex: colors[0]?.hex || null,
    region_colors: colors,
  };
}

test("validated pants SAM mask owns green pixels after belt and footwear exclusions", () => {
  const img = image();
  const pantsBox = { x: 0.30, y: 0.42, width: 0.40, height: 0.50 };
  const beltBox = { x: 0.28, y: 0.43, width: 0.44, height: 0.06 };
  const shoesBox = { x: 0.30, y: 0.84, width: 0.40, height: 0.14 };
  paint(img, pantsBox, "#4E604F");
  paint(img, beltBox, "#101114");
  paint(img, shoesBox, "#0D131E");

  const pants = dinoRegion("pants", "lower_garment", pantsBox, "pants", "#0D131E");
  const pantsMask = samRegion("sam_pants", "lower_garment", pantsBox, "pants", [{ hex: "#4E604F", pct: 1 }]);
  const belt = {
    ...dinoRegion("belt", "accessory_jewelry", beltBox, "belt", "#101114"),
    object_type: "belt",
    accessory_type: "belt",
  };
  const shoes = dinoRegion("shoes", "footwear", shoesBox, "shoes", "#0D131E");

  const result = applyPieceColorOwnershipV1({ decodedImage: img, regions: [pants, pantsMask, belt, shoes] });
  const corrected = result.regions.find((region) => region.id === "pants");
  assert.equal(corrected.dominant_hex, "#4E604F");
  assert.equal(corrected.region_colors[0].hex, "#4E604F");
  assert.equal(corrected.color_debug.piece_color_ownership_v1.applied, true);
  assert.equal(corrected.color_debug.piece_color_ownership_v1.measurement_source, "sam_mask_interior");
  assert.equal(corrected.color_debug.piece_color_ownership_v1.doctrine, "measure_validate_publish");
  assert.equal(corrected.color_debug.piece_color_ownership_v1.sam_ownership_validators[0].validated, true);
  assert.deepEqual(
    corrected.color_debug.piece_color_ownership_v1.ownership_claims.map((claim) => claim.piece_class).sort(),
    ["belt", "footwear"]
  );
});

test("validated shirt SAM mask prevents bag pixels from contaminating upper garment", () => {
  const img = image();
  const shirtBox = { x: 0.20, y: 0.12, width: 0.60, height: 0.48 };
  const bagBox = { x: 0.64, y: 0.24, width: 0.16, height: 0.28 };
  paint(img, shirtBox, "#60321E");
  paint(img, bagBox, "#17191D");

  const shirt = dinoRegion("shirt", "upper_garment", shirtBox, "shirt", "#17191D");
  const shirtMask = samRegion("sam_shirt", "upper_garment", shirtBox, "shirt", [{ hex: "#60321E", pct: 1 }]);
  const bag = dinoRegion("bag", "bag", bagBox, "crossbody bag", "#17191D");
  const result = applyPieceColorOwnershipV1({ decodedImage: img, regions: [shirt, shirtMask, bag] });
  const corrected = result.regions.find((region) => region.id === "shirt");

  assert.equal(corrected.dominant_hex, "#60321E");
  assert.equal(corrected.color_debug.piece_color_ownership_v1.ownership_claims[0].piece_class, "bag");
  assert.equal(corrected.color_debug.piece_color_ownership_v1.measurement_source, "sam_mask_interior");
});

test("validated mask remains color-neutral: a genuinely black garment remains black", () => {
  const img = image();
  const pantsBox = { x: 0.30, y: 0.42, width: 0.40, height: 0.50 };
  paint(img, pantsBox, "#0D131E");
  const pants = dinoRegion("pants", "lower_garment", pantsBox, "pants", "#0D131E");
  const pantsMask = samRegion("sam_pants", "lower_garment", pantsBox, "pants", [{ hex: "#0D131E", pct: 1 }]);

  const result = applyPieceColorOwnershipV1({ decodedImage: img, regions: [pants, pantsMask] });
  const measured = result.regions.find((region) => region.id === "pants");
  assert.equal(measured.dominant_hex, "#0D131E");
  assert.equal(measured.color_debug.piece_color_ownership_v1.applied, true);
  assert.equal(measured.color_debug.piece_color_ownership_v1.measurement_source, "sam_mask_interior");
  assert.equal(result.summary.measured_region_count, 1);
});

test("DINO-only garment measurement abstains instead of correcting from an unvalidated box", () => {
  const img = image();
  const shirtBox = { x: 0.20, y: 0.12, width: 0.60, height: 0.48 };
  paint(img, shirtBox, "#935234");
  const shirt = dinoRegion("shirt", "upper_garment", shirtBox, "shirt", "#C9A778");

  const result = applyPieceColorOwnershipV1({ decodedImage: img, regions: [shirt] });
  const measured = result.regions[0];
  assert.equal(measured.dominant_hex, "#C9A778");
  assert.equal(measured.color_debug.piece_color_ownership_v1.applied, false);
  assert.equal(measured.color_debug.piece_color_ownership_v1.reason, "no_validated_pixel_ownership_authority");
  assert.equal(measured.color_debug.piece_color_ownership_v1.measurement_authority_v1.selected, null);
});

test("validated shirt SAM mask can correct a contaminated DINO bbox color", () => {
  const img = image();
  const shirtBox = { x: 0.20, y: 0.12, width: 0.60, height: 0.48 };
  paint(img, shirtBox, "#935234");
  const shirt = dinoRegion("shirt", "upper_garment", shirtBox, "shirt", "#C9A778");
  const shirtMask = samRegion("sam_shirt", "upper_garment", shirtBox, "shirt", [{ hex: "#935234", pct: 1 }]);

  const result = applyPieceColorOwnershipV1({ decodedImage: img, regions: [shirt, shirtMask] });
  const measured = result.regions.find((region) => region.id === "shirt");
  assert.equal(measured.dominant_hex, "#935234");
  assert.equal(measured.region_colors[0].hex, "#935234");
  assert.equal(measured.color_debug.piece_color_ownership_v1.raw_dominant_hex, "#C9A778");
  assert.equal(measured.color_debug.piece_color_ownership_v1.measurement_authority_v1.selected.hex, "#935234");
  assert.equal(measured.color_debug.piece_color_ownership_v1.measurement_authority_v1.selected.ownership_validated, true);
  assert.equal(result.summary.corrected_region_count, 1);
});

test("generic unlabeled SAM masks cannot validate garment ownership", () => {
  const img = image();
  const shirtBox = { x: 0.20, y: 0.12, width: 0.60, height: 0.48 };
  paint(img, shirtBox, "#935234");
  const shirt = dinoRegion("shirt", "upper_garment", shirtBox, "shirt", "#C9A778");
  const genericMask = samRegion("sam_1", "upper_garment", shirtBox, "segment_1", [{ hex: "#935234", pct: 1 }]);

  const result = applyPieceColorOwnershipV1({ decodedImage: img, regions: [shirt, genericMask] });
  const measured = result.regions.find((region) => region.id === "shirt");
  assert.equal(measured.dominant_hex, "#C9A778");
  assert.equal(measured.color_debug.piece_color_ownership_v1.applied, false);
  assert.equal(measured.color_debug.piece_color_ownership_v1.sam_ownership_validators.length, 0);
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
