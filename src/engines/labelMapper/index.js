// src/engines/labelMapper/index.js
// Production label mapper engine for human-readable mode, category, and color labels.

import chroma from "chroma-js";

const MODE_LABELS = Object.freeze({
  balance: "Balance",
  contrast: "Contrast",
  cohesion: "Cohesion",
  natural: "Natural",
  explore: "Explore",
  emphasis: "Emphasis",
});

const CATEGORY_LABELS = Object.freeze({
  jackets: "jacket",
  jacket: "jacket",
  outerwear: "jacket",
  coat: "jacket",
  bomber: "jacket",
  overshirt: "jacket",

  shirts: "shirt",
  shirt: "shirt",
  tee: "shirt",
  tshirt: "shirt",
  "t shirt": "shirt",
  "t-shirt": "shirt",
  top: "shirt",
  tops: "shirt",
  "button up": "shirt",
  buttonup: "shirt",

  sweaters: "sweater",
  sweater: "sweater",
  knit: "sweater",
  cardigan: "sweater",
  cardigans: "sweater",
  pullover: "sweater",

  hoodies: "hoodie",
  hoodie: "hoodie",
  sweatshirt: "hoodie",

  pants: "pants",
  pant: "pants",
  trousers: "pants",
  trouser: "pants",
  jeans: "pants",
  jean: "pants",
  chinos: "pants",
  chino: "pants",
  bottoms: "pants",

  shorts: "shorts",

  shoes: "shoes",
  shoe: "shoes",
  footwear: "shoes",
  loafers: "shoes",
  loafer: "shoes",

  boots: "boots",
  boot: "boots",
  sneakers: "sneakers",
  sneaker: "sneakers",
  trainers: "sneakers",
  trainer: "sneakers",

  accessories: "accessory",
  accessory: "accessory",
  bag: "accessory",
  bags: "accessory",
  hat: "accessory",
  hats: "accessory",
  belt: "accessory",
  belts: "accessory",
  watch: "accessory",
  strap: "accessory",
});

function normalizeText(value = "") {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_-]+/g, " ")
    .replace(/[^a-zA-Z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function round2(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function safeHex(hex) {
  try {
    return chroma(hex).hex().toUpperCase();
  } catch {
    return null;
  }
}

function getHue(hex) {
  try {
    const [h] = chroma(hex).hsl();
    return Number.isFinite(h) ? h : 0;
  } catch {
    return 0;
  }
}

function getSat(hex) {
  try {
    const [, saturation] = chroma(hex).hsl();
    return clamp01(saturation || 0);
  } catch {
    return 0;
  }
}

function getLight(hex) {
  try {
    const [, , lightness] = chroma(hex).hsl();
    return clamp01(lightness || 0);
  } catch {
    return 0;
  }
}

function getLab(hex) {
  try {
    const [l, a, b] = chroma(hex).lab();
    return { l: round2(l), a: round2(a), b: round2(b) };
  } catch {
    return { l: 0, a: 0, b: 0 };
  }
}

function getChromaMagnitudeFromLab(lab) {
  const a = Number(lab?.a || 0);
  const b = Number(lab?.b || 0);
  return round2(Math.sqrt(a * a + b * b));
}

function isVeryDarkLowChroma(hex) {
  const safe = safeHex(hex);
  if (!safe) return false;

  const lab = getLab(safe);
  const chromaMagnitude = getChromaMagnitudeFromLab(lab);
  return lab.l < 18 && chromaMagnitude < 16;
}

function isBlueHue(hue) {
  return hue >= 205 && hue <= 252;
}

function isNavyCandidate(hex) {
  const safe = safeHex(hex);
  if (!safe) return false;

  const hue = getHue(safe);
  const saturation = getSat(safe);
  const lightness = getLight(safe);
  const chromaMagnitude = getChromaMagnitudeFromLab(getLab(safe));

  if (!isBlueHue(hue)) return false;
  if (lightness < 0.28 && (saturation < 0.2 || chromaMagnitude < 22)) return false;
  return saturation >= 0.18 && chromaMagnitude >= 20;
}

function uniqHexes(hexes = []) {
  if (!Array.isArray(hexes)) return [];

  const seen = new Set();
  const out = [];
  for (const hex of hexes) {
    const safe = safeHex(hex);
    if (!safe || seen.has(safe)) continue;
    seen.add(safe);
    out.push(safe);
  }
  return out;
}

export function getColorName(hex) {
  const safe = safeHex(hex);
  if (!safe) return "Unknown";

  const hue = getHue(safe);
  const saturation = getSat(safe);
  const lightness = getLight(safe);
  const chromaMagnitude = getChromaMagnitudeFromLab(getLab(safe));

  if (saturation < 0.05 && lightness < 0.1) return "Jet Black";
  if (saturation < 0.07 && lightness < 0.18) return "Graphite Black";
  if (saturation < 0.09 && lightness < 0.28) return "Charcoal";
  if (saturation < 0.1 && lightness < 0.4) return "Slate Gray";
  if (saturation < 0.1 && lightness >= 0.42 && lightness <= 0.7) return "Graphite";
  if (saturation < 0.08 && lightness >= 0.7 && lightness <= 0.9) return "Chrome Silver";
  if (saturation < 0.12 && lightness < 0.58) return "Stone Gray";
  if (saturation < 0.12 && lightness < 0.74) return "Ash Gray";
  if (saturation < 0.1 && lightness > 0.93) return "Soft White";
  if (saturation < 0.15 && lightness > 0.84) return "Linen White";
  if (saturation < 0.18 && lightness > 0.74) return "Ivory";
  if (saturation < 0.22 && lightness > 0.64) return "Soft Linen";
  if (isVeryDarkLowChroma(safe)) return lightness < 0.16 ? "Jet Black" : "Graphite Black";

  const isMuted = chromaMagnitude < 32 || saturation < 0.32;
  const isSoft = lightness >= 0.32 && lightness <= 0.78;

  if (isMuted && isSoft) {
    if (hue >= 205 && hue < 235) return lightness < 0.52 ? "Muted Blue" : "Dusty Blue";
    if (hue >= 235 && hue < 255) return lightness < 0.52 ? "Washed Indigo" : "Periwinkle Blue";
    if (hue >= 175 && hue < 205) return "Muted Teal";
    if (hue >= 255 && hue < 290) return "Dusty Violet";
    if (hue >= 105 && hue < 165) return "Muted Sage";
    if (hue >= 15 && hue < 28) return lightness < 0.52 ? "Luxury Tan" : "Soft Camel";
    if (hue >= 28 && hue < 40) return lightness < 0.52 ? "Muted Tan" : "Soft Sand";
    if (hue >= 40 && hue < 65) return "Warm Sand";
    if (hue >= 315 || hue < 15) return "Dusty Rose";
  }

  if (hue >= 345 || hue < 8) return lightness < 0.48 ? "Deep Crimson" : "Rose";
  if (hue >= 8 && hue < 18) return lightness < 0.46 ? "Brick Red" : "Coral";
  if (hue >= 315 && hue < 333) return lightness < 0.54 ? "Berry" : "Dusty Rose";
  if (hue >= 333 && hue < 345) return lightness < 0.52 ? "Muted Lip Rose" : "Soft Blush";

  if (hue >= 18 && hue < 28) return lightness < 0.42 ? "Rich Brown" : "Desert Tan";
  if (hue >= 28 && hue < 40) return lightness < 0.48 ? "Cognac" : "Camel";
  if (hue >= 40 && hue < 50) return lightness < 0.52 ? "Burnt Umber" : "Warm Sand";
  if (hue >= 50 && hue < 60) return lightness < 0.56 ? "Golden Amber" : "Sand Beige";

  if (hue >= 60 && hue < 78) return lightness < 0.48 ? "Olive" : "Soft Olive";
  if (hue >= 78 && hue < 105) return lightness < 0.5 ? "Olive Green" : "Muted Sage";
  if (hue >= 105 && hue < 145) return lightness < 0.44 ? "Forest Green" : "Sage";
  if (hue >= 145 && hue < 175) return lightness < 0.44 ? "Deep Teal" : "Teal";

  if (hue >= 175 && hue < 205) return lightness < 0.5 ? "Steel Teal" : "Sea Blue";
  if (hue >= 205 && hue < 228) return isNavyCandidate(safe) ? (lightness < 0.38 ? "Midnight Navy" : "Steel Blue") : "Graphite Black";
  if (hue >= 228 && hue < 250) return isNavyCandidate(safe) ? (lightness < 0.4 ? "Deep Navy" : "Powder Blue") : "Graphite Black";

  if (hue >= 250 && hue < 280) return lightness < 0.48 ? "Royal Purple" : "Periwinkle";
  if (hue >= 280 && hue < 315) return lightness < 0.54 ? "Plum" : "Lavender";

  return "Refined Neutral";
}

export function buildNamedHex(hex) {
  const safe = safeHex(hex);
  return safe ? { hex: safe, name: getColorName(safe) } : null;
}

export function buildNamedHexes(hexes) {
  return uniqHexes(hexes).map(buildNamedHex).filter(Boolean);
}

export function normalizeModeLabel(mode) {
  const key = normalizeText(mode);
  return MODE_LABELS[key] || "Balance";
}

export function normalizeCategoryLabel(value, fallback = "piece") {
  const text = normalizeText(value);
  if (!text) return fallback;
  return CATEGORY_LABELS[text] || text;
}

export default {
  getColorName,
  buildNamedHex,
  buildNamedHexes,
  normalizeModeLabel,
  normalizeCategoryLabel,
};
