import assert from "node:assert/strict";

import {
  getZoneAliases,
  getZoneFromLabel,
  mapLabelsToZones,
  mapLabelToZone,
  normalizeZoneKey,
} from "../src/engines/zoneMapper/index.js";

assert.equal(getZoneFromLabel("hoodie"), "upper_garment");
assert.equal(getZoneFromLabel("jeans"), "lower_garment");
assert.equal(getZoneFromLabel("sneakers"), "footwear");
assert.equal(getZoneFromLabel("watch"), "accessory_jewelry");
assert.equal(getZoneFromLabel("sunglasses"), "eyewear");
assert.equal(getZoneFromLabel("unknown item"), "unknown");

assert.equal(mapLabelToZone("tote bag"), "bag");

assert.deepEqual(mapLabelsToZones(["hoodie", "jeans", "sunglasses"]), [
  "upper_garment",
  "lower_garment",
  "eyewear",
]);

assert.equal(normalizeZoneKey("upper garment"), "upper_garment");

const zoneAliases = getZoneAliases();
assert.ok(zoneAliases && typeof zoneAliases === "object");
assert.ok(Object.hasOwn(zoneAliases, "upper_garment"));
assert.ok(Object.hasOwn(zoneAliases, "footwear"));

console.log("ZONE MAPPER TESTS PASSED");
