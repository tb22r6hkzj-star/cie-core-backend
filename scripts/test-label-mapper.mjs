import assert from "node:assert/strict";

import {
  buildNamedHex,
  buildNamedHexes,
  getColorName,
  normalizeCategoryLabel,
  normalizeModeLabel,
} from "../src/engines/labelMapper/index.js";

assert.equal(normalizeModeLabel("balance"), "Balance");
assert.equal(normalizeModeLabel("emphasis"), "Emphasis");
assert.equal(normalizeModeLabel("unknown"), "Balance");

assert.equal(normalizeCategoryLabel("tee"), "shirt");
assert.equal(normalizeCategoryLabel("sneakers"), "sneakers");
assert.equal(normalizeCategoryLabel("", "piece"), "piece");

assert.equal(typeof getColorName("#111111"), "string");
assert.notEqual(getColorName("#111111"), "");
assert.notEqual(getColorName("#111111"), "Deep Olive");
assert.equal(getColorName("#1E201B"), "Deep Olive");
assert.equal(getColorName("not-a-color"), "Unknown");

const namedBlack = buildNamedHex("#000000");
assert.ok(namedBlack && typeof namedBlack === "object");
assert.equal(namedBlack.hex, "#000000");
assert.equal(typeof namedBlack.name, "string");
assert.notEqual(namedBlack.name, "");

const uniqueNamedHexes = buildNamedHexes(["#000000", "#000000", "#FFFFFF"]);
assert.equal(uniqueNamedHexes.length, 2);
assert.deepEqual(
  uniqueNamedHexes.map(({ hex }) => hex),
  ["#000000", "#FFFFFF"],
);

console.log("LABEL MAPPER TESTS PASSED");
