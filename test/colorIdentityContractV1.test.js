import test from "node:test";
import assert from "node:assert/strict";
import { buildCanonicalColorIdentityV1, canonicalizeColorObjectV1 } from "../src/intelligence/colorIdentityContractV1.js";

test("blue measurements cannot retain a conflicting green family", () => {
  const result = canonicalizeColorObjectV1({ hex: "#607A90", color_identity: { family: "green", name: "Olive Green" } });
  assert.equal(result.hex, "#607A90");
  assert.equal(result.color_identity.family, "blue");
  assert.match(result.name.toLowerCase(), /blue/);
});

test("pink measurements derive pink names and family from the measured hex", () => {
  const result = buildCanonicalColorIdentityV1("#E1609E");
  assert.equal(result.family, "pink");
  assert.match(result.name.toLowerCase(), /pink|rose|magenta/);
  assert.equal(result.authority, "visioncore_hex_derived");
});

test("canonical identity rejects invalid hex rather than guessing", () => {
  assert.deepEqual(buildCanonicalColorIdentityV1("not-a-color"), {
    valid: false, hex: null, name: null, family: null, reason: "invalid_hex",
  });
});
