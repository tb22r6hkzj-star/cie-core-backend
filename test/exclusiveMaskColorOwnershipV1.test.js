import test from "node:test";
import assert from "node:assert/strict";
import { extractMaskedRegionColors } from "../src/server.js";

function rgbaImage(width, height, hex = "#000000", alpha = 255) {
  const value = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16));
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = alpha;
  }
  return { width, height, data };
}

function paint(image, x0, y0, x1, y1, hex, alpha = 255) {
  const value = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16));
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const index = (y * image.width + x) * 4;
      image.data[index] = r;
      image.data[index + 1] = g;
      image.data[index + 2] = b;
      image.data[index + 3] = alpha;
    }
  }
}

function mask(width, height, x0, y0, x1, y1) {
  const image = rgbaImage(width, height, "#000000", 0);
  paint(image, x0, y0, x1, y1, "#FFFFFF", 255);
  return image;
}

test("exclusive mask ownership prevents visible outerwear pixels from voting as shirt colors", () => {
  const base = rgbaImage(20, 20, "#FFFFFF");
  paint(base, 1, 1, 8, 19, "#D92975");
  const shirtMask = mask(20, 20, 1, 1, 19, 19);
  const jacketMask = mask(20, 20, 1, 1, 8, 19);
  const shirt = { region: { id: "shirt", zone: "upper_garment", confidence: 0.9 }, maskImage: shirtMask, geometry: { pixel_count: 400 } };
  const jacket = { region: { id: "jacket", zone: "outerwear", confidence: 0.9 }, maskImage: jacketMask, geometry: { pixel_count: 160 } };

  const shirtColors = extractMaskedRegionColors(base, shirtMask, 6, { target: shirt, competitors: [jacket] });
  const jacketColors = extractMaskedRegionColors(base, jacketMask, 6, { target: jacket, competitors: [shirt] });

  assert.equal(shirtColors[0].hex, "#FFFFFF");
  assert.equal(shirtColors.some((color) => color.hex === "#D92975"), false);
  assert.equal(jacketColors[0].hex, "#D92975");
});

test("exclusive ownership is color-neutral and preserves a real secondary inside one garment", () => {
  const base = rgbaImage(20, 20, "#6D7D93");
  paint(base, 4, 4, 8, 8, "#E15F9E");
  const jeansMask = mask(20, 20, 1, 1, 19, 19);
  const jeans = { region: { id: "jeans", zone: "lower_garment", confidence: 0.9 }, maskImage: jeansMask, geometry: { pixel_count: 400 } };

  const colors = extractMaskedRegionColors(base, jeansMask, 6, { target: jeans, competitors: [] });

  assert.equal(colors[0].hex, "#6D7D93");
  assert.equal(colors.some((color) => color.hex === "#E15F9E"), true);
});
