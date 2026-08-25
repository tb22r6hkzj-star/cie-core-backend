import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("market transform route uses the governed semantic observer with off-by-default mode", () => {
  const source = fs.readFileSync(new URL("../src/server.js", import.meta.url), "utf8");
  assert.match(source, /normalizeExternalIntelligenceMode\(process\.env\.VISIONCORE_EXTERNAL_INTELLIGENCE_MODE, "off"\)/);
  assert.match(source, /runOpenAISemanticObserverV1\(\{/);
  assert.match(source, /publication_changed: false/);
  assert.match(source, /authority_owner: "visioncore"/);
});
