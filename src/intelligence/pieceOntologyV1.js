const CANONICAL_ZONE_BY_PIECE = Object.freeze({
  upper_garment: "upper_garment",
  lower_garment: "lower_garment",
  body_garment: "body_garment",
  outerwear: "outerwear",
  footwear: "footwear",
  belt: "belt",
  bag: "bag",
  eyewear: "eyewear",
  necklace: "accessory_jewelry",
  pendant: "accessory_jewelry",
  earrings: "accessory_jewelry",
  bracelet: "accessory_jewelry",
  watch: "accessory_jewelry",
  ring: "accessory_jewelry",
  brooch: "accessory_jewelry",
  accessory_jewelry: "accessory_jewelry",
});

export const CANONICAL_SEGMENTATION_ZONES_V1 = new Set([
  "upper_garment", "lower_garment", "body_garment", "outerwear",
  "footwear", "belt", "bag", "eyewear", "accessory_jewelry",
]);

export function cleanPieceTokenV1(value) {
  return String(value || "").trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function normalizePieceIdentityV1(value) {
  const token = cleanPieceTokenV1(value);
  if (!token) return null;
  if (/(necklace|neck_chain|chain_necklace)/.test(token)) return "necklace";
  if (/(pendant)/.test(token)) return "pendant";
  if (/(earring|ear_stud)/.test(token)) return "earrings";
  if (/(bracelet|wristband)/.test(token)) return "bracelet";
  if (/(watch)/.test(token)) return "watch";
  if (/(^|_)ring(s)?($|_)/.test(token)) return "ring";
  if (/(brooch|lapel_pin)/.test(token)) return "brooch";
  if (/(jewel|trouser_chain|wallet_chain|body_chain)/.test(token)) return "accessory_jewelry";
  if (/(handbag|shoulder_bag|side_bag|purse|clutch|satchel|tote|backpack|crossbody|bag)/.test(token)) return "bag";
  if (/(eyewear|glasses|sunglasses|spectacles)/.test(token)) return "eyewear";
  if (/(belt)/.test(token)) return "belt";
  if (/(shoe|loafer|sneaker|boot|footwear|heel|sandal|slipper)/.test(token)) return "footwear";
  if (/(jacket|coat|outerwear|blazer|cardigan|vest|parka|poncho)/.test(token)) return "outerwear";
  if (/(dress|jumpsuit|romper|one_piece|coverall)/.test(token)) return "body_garment";
  if (/(shirt|polo|blouse|sweater|hoodie|top|tee|t_shirt|tank)/.test(token)) return "upper_garment";
  if (/(trouser|pants|jeans|shorts|skirt|legging)/.test(token)) return "lower_garment";
  return CANONICAL_ZONE_BY_PIECE[token] ? token : token;
}

export function segmentationZoneForPieceV1(value, fallback = null) {
  const piece = normalizePieceIdentityV1(value);
  if (piece && CANONICAL_ZONE_BY_PIECE[piece]) return CANONICAL_ZONE_BY_PIECE[piece];
  const normalizedFallback = cleanPieceTokenV1(fallback);
  return CANONICAL_SEGMENTATION_ZONES_V1.has(normalizedFallback) ? normalizedFallback : null;
}

export function normalizeConfidenceV1(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n > 1 ? n / 100 : n));
}

