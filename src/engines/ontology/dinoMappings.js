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
    label: 'hoodie',
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
    label: 'jeans',
    category: 'pants',
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
    label: 'sunglasses',
    category: 'accessory',
    zone: 'eyewear',
    confidence_floor: 0,
  },
  {
    label: 'watch',
    category: 'accessory',
    zone: 'accessory_jewelry',
    confidence_floor: 0,
  },
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
