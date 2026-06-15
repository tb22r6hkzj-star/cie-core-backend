import assert from "node:assert/strict";

import {
  OCCASION_ARCHETYPES,
  OCCASION_CATEGORIES,
  OCCASION_IDS,
  OCCASION_MODES,
} from "../src/engines/ontology/occasionOntology.js";

const assertIncludes = (collection, expectedValues) => {
  for (const expectedValue of expectedValues) {
    assert.ok(collection.includes(expectedValue));
  }
};

assertIncludes(OCCASION_IDS, [
  "casual",
  "smart_casual",
  "business_casual",
  "business",
  "formal",
  "evening",
  "streetwear",
  "athleisure",
]);

assertIncludes(OCCASION_CATEGORIES.business, [
  "jacket",
  "shirt",
  "pants",
  "shoes",
]);

assertIncludes(OCCASION_CATEGORIES.streetwear, [
  "hoodie",
  "sneakers",
  "jacket",
]);

assertIncludes(OCCASION_MODES.formal, ["Cohesion", "Balance"]);
assertIncludes(OCCASION_MODES.streetwear, ["Explore", "Contrast"]);

assertIncludes(OCCASION_ARCHETYPES.business, ["Classic", "Minimalist"]);
assertIncludes(OCCASION_ARCHETYPES.formal, ["Minimalist", "Statement"]);
assertIncludes(OCCASION_ARCHETYPES.streetwear, ["Creative", "Statement"]);

console.log("OCCASION ONTOLOGY TESTS PASSED");
