// src/engines/zoneMapper/index.js
// Production zone mapper engine for converting detection and product labels into canonical zones.

const UNKNOWN_ZONE = "unknown";

const ZONE_ALIASES = Object.freeze({
  upper_garment: Object.freeze([
    "upper",
    "shirt",
    "top",
    "torso",
    "tee",
    "t-shirt",
    "tshirt",
    "blouse",
    "sweater",
    "sweatshirt",
    "hoodie",
    "pullover",
    "tank",
    "camisole",
    "polo",
    "jersey",
    "cardigan",
    "bodice",
  ]),
  lower_garment: Object.freeze([
    "lower",
    "pants",
    "pant",
    "trouser",
    "trousers",
    "jean",
    "jeans",
    "denim",
    "skirt",
    "shorts",
    "legging",
    "leggings",
    "jogger",
    "joggers",
    "chino",
    "chinos",
    "slacks",
  ]),
  outerwear: Object.freeze([
    "outer",
    "outerwear",
    "jacket",
    "coat",
    "blazer",
    "parka",
    "overcoat",
    "trench",
    "windbreaker",
    "anorak",
    "vest",
    "waistcoat",
  ]),
  body_garment: Object.freeze([
    "body garment",
    "body_garment",
    "dress",
    "gown",
    "jumpsuit",
    "romper",
    "onesie",
    "one piece",
    "one-piece",
    "one_piece",
    "suit",
  ]),
  footwear: Object.freeze([
    "shoe",
    "shoes",
    "boot",
    "boots",
    "sneaker",
    "sneakers",
    "trainer",
    "trainers",
    "foot",
    "footwear",
    "loafer",
    "loafers",
    "heel",
    "heels",
    "sandal",
    "sandals",
    "slipper",
    "slippers",
  ]),
  eyewear: Object.freeze([
    "eyewear",
    "glass",
    "glasses",
    "sunglass",
    "sunglasses",
    "spectacles",
    "frames",
    "lenses",
  ]),
  bag: Object.freeze([
    "bag",
    "bags",
    "purse",
    "tote",
    "tote bag",
    "handbag",
    "clutch",
    "satchel",
    "backpack",
    "duffel",
    "crossbody",
    "wallet",
  ]),
  hair: Object.freeze(["hair", "hairstyle", "head hair"]),
  lips: Object.freeze(["lip", "lips", "lipstick", "mouth"]),
  fur_trim: Object.freeze(["fur", "trim", "fur trim", "faux fur", "shearling"]),
  logo_text_detail: Object.freeze([
    "logo",
    "text",
    "graphic",
    "print",
    "pattern",
    "lettering",
    "emblem",
    "branding",
    "detail",
  ]),
  accessory_jewelry: Object.freeze([
    "accessor",
    "accessory",
    "accessories",
    "jewel",
    "jewelry",
    "jewellery",
    "necklace",
    "watch",
    "ring",
    "bracelet",
    "earring",
    "earrings",
    "chain",
    "pendant",
    "brooch",
    "pin",
    "belt",
    "scarf",
    "hat",
    "cap",
    "beanie",
  ]),
});

const NORMALIZED_ALIAS_ENTRIES = Object.freeze(
  Object.entries(ZONE_ALIASES).flatMap(([zone, aliases]) =>
    aliases.map((alias) => Object.freeze({ zone, alias: normalizeLabel(alias) }))
  )
);

export const ZONE_MAPPER_ENGINE = Object.freeze({
  name: "zoneMapper",
  version: "1.0.0",
  zones: Object.freeze([...Object.keys(ZONE_ALIASES), UNKNOWN_ZONE]),
});

export function normalizeLabel(label = "") {
  return String(label ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_-]+/g, " ")
    .replace(/[^a-zA-Z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function normalizeZoneKey(zone = "") {
  const normalized = normalizeLabel(zone).replace(/\s+/g, "_");
  return Object.hasOwn(ZONE_ALIASES, normalized) || normalized === UNKNOWN_ZONE ? normalized : UNKNOWN_ZONE;
}

export function getZoneAliases() {
  return Object.fromEntries(Object.entries(ZONE_ALIASES).map(([zone, aliases]) => [zone, [...aliases]]));
}

export function getZoneFromLabel(label = "") {
  const normalized = normalizeLabel(label);
  if (!normalized) return UNKNOWN_ZONE;

  const directZone = normalizeZoneKey(normalized);
  if (directZone !== UNKNOWN_ZONE) return directZone;

  const padded = ` ${normalized} `;
  const match = NORMALIZED_ALIAS_ENTRIES.find(({ alias }) => alias && padded.includes(` ${alias} `));
  return match?.zone || UNKNOWN_ZONE;
}

export function mapLabelToZone(label = "") {
  return getZoneFromLabel(label);
}

export function mapLabelsToZones(labels = []) {
  if (!Array.isArray(labels)) return [];
  return labels.map((label) => mapLabelToZone(label));
}

export function mapZones(input = []) {
  if (Array.isArray(input)) return mapLabelsToZones(input);
  if (input && typeof input === "object") {
    return Object.fromEntries(Object.entries(input).map(([key, label]) => [key, mapLabelToZone(label)]));
  }
  return mapLabelToZone(input);
}

const zoneMapper = Object.freeze({
  ZONE_MAPPER_ENGINE,
  getZoneFromLabel,
  mapLabelToZone,
  mapLabelsToZones,
  normalizeLabel,
  normalizeZoneKey,
  getZoneAliases,
  mapZones,
});

export default zoneMapper;
