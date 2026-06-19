const ACCESSORY_TYPE_RULES = [
  {
    tokens: ["hat", "cap", "beanie", "headwear"],
    display_zone_label: "Headwear",
    accessory_type: "hat",
  },
  {
    tokens: ["necklace", "chain", "pendant"],
    display_zone_label: "Jewelry",
    accessory_type: "necklace",
  },
  {
    tokens: ["watch"],
    display_zone_label: "Watch",
    accessory_type: "watch",
  },
  {
    tokens: ["ring"],
    display_zone_label: "Ring",
    accessory_type: "ring",
  },
  {
    tokens: ["bracelet"],
    display_zone_label: "Bracelet",
    accessory_type: "bracelet",
  },
];

function normalizeAccessorySourceLabel(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ");
}

export function inferAccessoryDisplayMetadata(sourceLabels = []) {
  const labels = (Array.isArray(sourceLabels) ? sourceLabels : [sourceLabels])
    .map(normalizeAccessorySourceLabel)
    .filter(Boolean);
  const joinedLabels = labels.join(" ");

  for (const rule of ACCESSORY_TYPE_RULES) {
    if (rule.tokens.some((token) => joinedLabels.includes(token))) {
      return {
        display_zone_label: rule.display_zone_label,
        accessory_type: rule.accessory_type,
        object_type: rule.accessory_type,
      };
    }
  }

  return {
    display_zone_label: "Accessory",
    accessory_type: null,
    object_type: "accessory",
  };
}
