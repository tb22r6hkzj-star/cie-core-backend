import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("market transform route activates the governed semantic observer in shadow mode", () => {
  const source = fs.readFileSync(new URL("../src/server.js", import.meta.url), "utf8");
  assert.match(source, /normalizeExternalIntelligenceMode\(process\.env\.VISIONCORE_EXTERNAL_INTELLIGENCE_MODE, "shadow"\)/);
  assert.match(source, /runOpenAISemanticObserverV1\(\{/);
  assert.match(source, /captureQuality\?\.disposition === "retake"/);
  assert.match(source, /publication_changed: false/);
  assert.match(source, /authority_owner: "visioncore"/);
});
