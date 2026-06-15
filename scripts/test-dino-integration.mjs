import assert from "node:assert/strict";

import { mapDinoLabel } from "../src/engines/ontology/dinoMappings.js";
import { getZoneFromLabel } from "../src/engines/zoneMapper/index.js";

function getZoneFromOpenVocabularyLabel(label) {
  const mapping = mapDinoLabel(label);
  if (mapping?.zone && mapping.zone !== "unknown") return mapping.zone;
  return getZoneFromLabel(label);
}

assert.equal(getZoneFromOpenVocabularyLabel("hoodie"), "upper_garment");
assert.equal(getZoneFromOpenVocabularyLabel("jacket"), "outerwear");
assert.equal(getZoneFromOpenVocabularyLabel("handbag"), "bag");
assert.equal(getZoneFromOpenVocabularyLabel("sunglasses"), "eyewear");
assert.equal(getZoneFromOpenVocabularyLabel("watch"), "accessory_jewelry");
assert.equal(getZoneFromOpenVocabularyLabel("unknown object"), "unknown");

console.log("DINO INTEGRATION TESTS PASSED");
