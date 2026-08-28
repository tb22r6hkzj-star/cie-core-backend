/**
 * Central mapping layer for open-vocabulary / DINO-style detection labels into
 * VisionCore canonical categories and zones.
 */
export const DINO_LABEL_MAPPINGS = [
  {
    label: 'shirt',
    category: 'shirt',
    zone: 'upper_garment',
    confidence_floor: 0,
  },
  {
    label: 't-shirt',
    category: 'shirt',
    zone: 'upper_garment',
    confidence_floor: 0,
  },

  {
    label: 'hat',
    category: 'accessory',
    zone: 'accessory_jewelry',
    display_zone_label: 'Headwear',
    accessory_type: 'hat',
    object_type: 'hat',
    confidence_floor: 0,
  },
  {
    label: 'cap',
    category: 'accessory',
    zone: 'accessory_jewelry',
    display_zone_label: 'Headwear',
    accessory_type: 'cap',
    object_type: 'cap',
    confidence_floor: 0,
  },
  {
    label: 'beanie',
    category: 'accessory',
    zone: 'accessory_jewelry',
    display_zone_label: 'Headwear',
    accessory_type: 'beanie',
    object_type: 'beanie',
    confidence_floor: 0,
  },
  {
    label: 'sweater',
    category: 'sweater',
    zone: 'upper_garment',
    confidence_floor: 0,
  },
  {
    label: 'hoodie',
    category: 'hoodie',
    zone: 'upper_garment',
    confidence_floor: 0,
  },
  {
    label: 'sweater hoodie',
    category: 'hoodie',
    zone: 'upper_garment',
    confidence_floor: 0,
  },
  {
    label: 'jacket',
    category: 'jacket',
    zone: 'outerwear',
    confidence_floor: 0,
  },
  {
    label: 'coat',
    category: 'jacket',
    zone: 'outerwear',
    confidence_floor: 0,
  },
  {
    label: 'pants',
    category: 'pants',
    zone: 'lower_garment',
    confidence_floor: 0,
  },
  {
    // Grounding DINO can join adjacent open-vocabulary prompts. The box is
    // still lower-body evidence even when the returned label is combined.
    label: 'pants skirt',
    category: 'pants',
    zone: 'lower_garment',
    confidence_floor: 0.4,
  },
  {
    label: 'jeans',
    category: 'pants',
    zone: 'lower_garment',
    confidence_floor: 0,
  },

  {
    label: 'shorts',
    category: 'shorts',
    zone: 'lower_garment',
    confidence_floor: 0,
  },
  {
    label: 'shorts skirt',
    category: 'skirt',
    zone: 'lower_garment',
    confidence_floor: 0,
  },
  {
    label: 'skirt',
    category: 'skirt',
    zone: 'lower_garment',
    confidence_floor: 0,
  },
  {
    label: 'shoes',
    category: 'shoes',
    zone: 'footwear',
    confidence_floor: 0,
  },
  {
    label: 'sneakers',
    category: 'sneakers',
    zone: 'footwear',
    confidence_floor: 0,
  },
  {
    label: 'shoes sneakers',
    category: 'sneakers',
    zone: 'footwear',
    confidence_floor: 0.4,
  },
  {
    label: 'boots',
    category: 'boots',
    zone: 'footwear',
    confidence_floor: 0,
  },
  {
    label: 'bag',
    category: 'accessory',
    zone: 'bag',
    confidence_floor: 0,
  },
  {
    label: 'handbag',
    category: 'accessory',
    zone: 'bag',
    confidence_floor: 0,
  },
  {
    label: 'purse',
    category: 'accessory',
    zone: 'bag',
    confidence_floor: 0,
  },
  {
    label: 'tote',
    category: 'accessory',
    zone: 'bag',
    confidence_floor: 0,
  },
  {
    label: 'crossbody',
    category: 'accessory',
    zone: 'bag',
    confidence_floor: 0,
  },
  {
    label: 'backpack',
    category: 'accessory',
    zone: 'bag',
    confidence_floor: 0,
  },
  {
    label: 'wallet',
    category: 'accessory',
    zone: 'bag',
    confidence_floor: 0,
  },
  {
    label: 'sunglasses',
    category: 'accessory',
    zone: 'eyewear',
    confidence_floor: 0,
  },
  {
    label: 'glasses',
    category: 'accessory',
    zone: 'eyewear',
    confidence_floor: 0,
  },
  {
    label: 'spectacles',
    category: 'accessory',
    zone: 'eyewear',
    confidence_floor: 0,
  },
  {
    label: 'frames',
    category: 'accessory',
    zone: 'eyewear',
    confidence_floor: 0,
  },
  {
    label: 'lenses',
    category: 'accessory',
    zone: 'eyewear',
    confidence_floor: 0,
  },
  ...['chain', 'necklace', 'pendant', 'ring', 'bracelet', 'earring', 'earrings', 'brooch', 'pin'].map((label) => ({
    label,
    category: 'accessory',
    zone: 'accessory_jewelry',
    display_zone_label: label.startsWith('earring')
      ? 'Earrings'
      : `${label.slice(0, 1).toUpperCase()}${label.slice(1)}`,
    accessory_type: label.startsWith('earring') ? 'earrings' : label,
    object_type: label.startsWith('earring') ? 'earrings' : label,
    confidence_floor: 0,
  })),
  {
    label: 'watch',
    category: 'accessory',
    zone: 'accessory_jewelry',
    display_zone_label: 'Watch',
    accessory_type: 'watch',
    object_type: 'watch',
    confidence_floor: 0,
  },
  ...['belt', 'waist belt', 'belt buckle', 'waistband belt'].map((label) => ({
    label,
    category: 'accessory',
    zone: 'accessory_jewelry',
    display_zone_label: 'Belt',
    accessory_type: 'belt',
    object_type: 'belt',
    confidence_floor: 0.55,
  })),
  ...['scarf', 'accessory', 'accessories'].map((label) => ({
    label,
    category: 'accessory',
    zone: 'accessory_jewelry',
    display_zone_label: 'Accessory',
    accessory_type: label,
    object_type: label,
    confidence_floor: 0,
  })),
];

const normalizeDinoLabel = (label) => String(label ?? '').trim().toLowerCase();

export function getDinoMapping(label) {
  const normalizedLabel = normalizeDinoLabel(label);

  return DINO_LABEL_MAPPINGS.find((mapping) => mapping.label === normalizedLabel) ?? null;
}

export function mapDinoLabel(label) {
  const mapping = getDinoMapping(label);

  if (mapping) {
    return mapping;
  }

  return {
    label,
    category: 'piece',
    zone: 'unknown',
    confidence_floor: 0,
  };
}
