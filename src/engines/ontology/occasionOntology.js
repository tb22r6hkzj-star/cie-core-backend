// src/engines/ontology/occasionOntology.js
// Phase 10 occasion intelligence ontology foundation.
//
// Central source of truth for occasion-aware fashion reasoning. This module is
// ontology-only and intentionally contains no scoring, retrieval, API, or image
// logic.

export const OCCASION_IDS = Object.freeze([
  "casual",
  "smart_casual",
  "business_casual",
  "business",
  "formal",
  "evening",
  "streetwear",
  "athleisure",
]);

export const OCCASION_CATEGORIES = Object.freeze({
  casual: Object.freeze(["shirt", "pants", "shoes"]),
  smart_casual: Object.freeze(["jacket", "shirt", "pants", "shoes"]),
  business_casual: Object.freeze(["jacket", "shirt", "pants", "shoes"]),
  business: Object.freeze(["jacket", "shirt", "pants", "shoes"]),
  formal: Object.freeze(["jacket", "shirt", "pants", "shoes"]),
  evening: Object.freeze(["jacket", "shirt", "pants", "shoes"]),
  streetwear: Object.freeze(["hoodie", "sneakers", "jacket"]),
  athleisure: Object.freeze(["hoodie", "sneakers", "shorts"]),
});

export const OCCASION_MODES = Object.freeze({
  casual: Object.freeze(["Balance", "Natural"]),
  smart_casual: Object.freeze(["Balance", "Cohesion"]),
  business_casual: Object.freeze(["Balance", "Cohesion"]),
  business: Object.freeze(["Balance", "Cohesion"]),
  formal: Object.freeze(["Cohesion", "Balance"]),
  evening: Object.freeze(["Contrast", "Explore"]),
  streetwear: Object.freeze(["Explore", "Contrast"]),
  athleisure: Object.freeze(["Natural", "Explore"]),
});

export const OCCASION_ARCHETYPES = Object.freeze({
  casual: Object.freeze(["Natural", "Classic"]),
  smart_casual: Object.freeze(["Classic", "Minimalist"]),
  business_casual: Object.freeze(["Classic", "Minimalist"]),
  business: Object.freeze(["Classic", "Minimalist"]),
  formal: Object.freeze(["Minimalist", "Statement"]),
  evening: Object.freeze(["Statement", "Creative"]),
  streetwear: Object.freeze(["Creative", "Statement"]),
  athleisure: Object.freeze(["Natural", "Creative"]),
});
