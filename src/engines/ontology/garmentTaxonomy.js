// src/engines/ontology/garmentTaxonomy.js
// Phase 6 garment taxonomy foundation.
//
// Central source of truth for garment categories, subtypes, and category
// relationships. This module is ontology-only and intentionally contains no
// scoring, retrieval, API, or image logic.

export const CATEGORY_SUBTYPES = Object.freeze({
  jacket: Object.freeze(["jacket", "bomber jacket", "coat", "overshirt", "blazer"]),
  shirt: Object.freeze(["shirt", "tee", "polo", "henley", "button down"]),
  pants: Object.freeze(["pants", "jeans", "chinos", "trousers"]),
  shoes: Object.freeze(["shoes", "sneakers", "loafers"]),
  accessory: Object.freeze(["watch", "belt", "bag", "hat"]),
});

export const CATEGORY_COMPATIBILITY = Object.freeze({
  jacket: Object.freeze(["coat", "blazer", "overshirt"]),
  shirt: Object.freeze(["tee", "polo", "henley"]),
  pants: Object.freeze(["jeans", "chinos", "trousers"]),
});

export const CATEGORY_TO_ZONE = Object.freeze({
  jacket: "outerwear",
  shirt: "upper_garment",
  pants: "lower_garment",
  shoes: "footwear",
  accessory: "accessory_jewelry",
});
