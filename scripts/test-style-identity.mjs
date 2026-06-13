import assert from "node:assert/strict";

import {
  deriveModifier,
  deriveStyleIdentity,
} from "../src/engines/styleIdentity/index.js";

assert.equal(deriveModifier({ boldness: 82 }), "Bold");
assert.equal(deriveModifier({ harmony: 86, boldness: 45 }), "Controlled");
assert.equal(deriveModifier({ versatility: 90 }), "Modern");
assert.equal(deriveModifier({ applicability: 88 }), "Refined");
assert.equal(
  deriveModifier({
    harmony: 78,
    applicability: 78,
    versatility: 78,
    boldness: 40,
  }),
  "Balanced",
);
assert.equal(deriveModifier({ boldness: 38 }), "Soft");
assert.equal(deriveModifier(), "Modern");
assert.equal(
  deriveModifier({
    harmony: 90,
    applicability: 90,
    versatility: 90,
    boldness: 82,
  }),
  "Bold",
);

assert.deepEqual(
  deriveStyleIdentity("Emphasis", {
    harmony: 78,
    applicability: 74,
    versatility: 62,
    boldness: 88,
  }),
  {
    mode: "Emphasis",
    modifier: "Bold",
    base_archetype: "Statement",
    label: "Bold Statement",
  },
);

console.log("STYLE IDENTITY TESTS PASSED");
