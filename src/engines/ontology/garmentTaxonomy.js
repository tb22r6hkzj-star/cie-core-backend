// src/engines/ontology/garmentTaxonomy.js
// Phase 6 garment taxonomy foundation.
//
// Central source of truth for garment categories, subtypes, and category
// relationships. This module is ontology-only and intentionally contains no
// scoring, retrieval, API, or image logic.

export const CATEGORY_SUBTYPES = Object.freeze({
  jacket: Object.freeze(["jacket", "bomber jacket", "overshirt", "coat"]),
  shirt: Object.freeze(["shirt", "tee", "button up", "top"]),
  sweater: Object.freeze(["sweater", "knit sweater", "cardigan", "pullover"]),
  hoodie: Object.freeze(["hoodie", "zip hoodie", "sweatshirt", "pullover hoodie"]),
  pants: Object.freeze(["pants", "trousers", "jeans", "chinos"]),
  shorts: Object.freeze(["shorts", "tailored shorts"]),
  shoes: Object.freeze(["shoes", "sneakers", "loafers", "footwear"]),
  boots: Object.freeze(["boots", "chelsea boots", "leather boots"]),
  sneakers: Object.freeze(["sneakers", "trainers", "low top sneakers"]),
  accessory: Object.freeze(["crossbody bag", "shoulder bag", "belt", "cap", "watch strap"]),
  piece: Object.freeze(["fashion piece", "style piece"]),
});


export const CATEGORY_SEARCH_KEYWORDS = Object.freeze({
  jacket: Object.freeze(["jacket", "overshirt", "bomber jacket", "coat"]),
  shirt: Object.freeze(["shirt", "tee", "button up", "top"]),
  sweater: Object.freeze(["sweater", "knit sweater", "cardigan", "pullover"]),
  hoodie: Object.freeze(["hoodie", "zip hoodie", "sweatshirt", "pullover hoodie"]),
  pants: Object.freeze(["pants", "trousers", "jeans", "chinos"]),
  shorts: Object.freeze(["shorts", "tailored shorts"]),
  shoes: Object.freeze(["shoes", "sneakers", "loafers", "footwear"]),
  boots: Object.freeze(["boots", "chelsea boots", "leather boots"]),
  sneakers: Object.freeze(["sneakers", "trainers", "low top sneakers"]),
  accessory: Object.freeze(["crossbody bag", "shoulder bag", "belt", "cap", "watch strap"]),
  piece: Object.freeze(["fashion piece"]),
});

export const CATEGORY_COMPATIBILITY = Object.freeze({
  jacket: Object.freeze(["coat", "outerwear", "overshirt"]),
  shirt: Object.freeze(["top", "tee"]),
  pants: Object.freeze(["jeans", "trousers"]),
  shoes: Object.freeze(["boots", "sneakers", "footwear", "loafers"]),
});

export const CATEGORY_TO_ZONE = Object.freeze({
  jacket: "outerwear",
  shirt: "upper_garment",
  pants: "lower_garment",
  shoes: "footwear",
  accessory: "accessory_jewelry",
});
