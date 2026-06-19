const ACCESSORY_TYPE_RULES = [
  {
    tokens: ["hat"],
    display_zone_label: "Headwear",
    accessory_type: "hat",
  },
  {
    tokens: ["cap"],
    display_zone_label: "Headwear",
    accessory_type: "cap",
  },
  {
    tokens: ["beanie"],
    display_zone_label: "Headwear",
    accessory_type: "beanie",
  },
  {
    tokens: ["chain"],
    display_zone_label: "Jewelry",
    accessory_type: "chain",
  },
  {
    tokens: ["necklace"],
    display_zone_label: "Jewelry",
    accessory_type: "necklace",
  },
  {
    tokens: ["pendant"],
    display_zone_label: "Jewelry",
    accessory_type: "pendant",
  },
  {
    tokens: ["ring"],
    display_zone_label: "Jewelry",
    accessory_type: "ring",
  },
  {
    tokens: ["bracelet"],
    display_zone_label: "Jewelry",
    accessory_type: "bracelet",
  },
  {
    tokens: ["earring", "earrings"],
    display_zone_label: "Jewelry",
    accessory_type: "earring",
  },
  {
    tokens: ["brooch"],
    display_zone_label: "Jewelry",
    accessory_type: "brooch",
  },
  {
    tokens: ["pin"],
    display_zone_label: "Jewelry",
    accessory_type: "pin",
  },
  {
    tokens: ["watch"],
    display_zone_label: "Watch",
    accessory_type: "watch",
  },
  {
    tokens: ["belt"],
    display_zone_label: "Accessory",
    accessory_type: "belt",
  },
  {
    tokens: ["scarf"],
    display_zone_label: "Accessory",
    accessory_type: "scarf",
  },
  {
    tokens: ["accessory", "accessories"],
    display_zone_label: "Accessory",
    accessory_type: "accessory",
  },
];

function normalizeAccessorySourceLabel(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function labelContainsToken(label, token) {
  return new RegExp(`(^|\\s)${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\s|$)`).test(label);
}

export function inferAccessoryDisplayMetadata(sourceLabels = []) {
  const labels = (Array.isArray(sourceLabels) ? sourceLabels : [sourceLabels])
    .map(normalizeAccessorySourceLabel)
    .filter(Boolean);
  const joinedLabels = labels.join(" ");

  for (const rule of ACCESSORY_TYPE_RULES) {
    if (rule.tokens.some((token) => labelContainsToken(joinedLabels, token))) {
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
