import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("market transform route activates bounded semantic publication assistance", () => {
  const source = fs.readFileSync(new URL("../src/server.js", import.meta.url), "utf8");
  assert.match(source, /normalizeExternalIntelligenceMode\(process\.env\.VISIONCORE_EXTERNAL_INTELLIGENCE_MODE, "shadow"\)/);
  assert.match(source, /runOpenAISemanticObserverV1\(\{/);
  assert.match(source, /captureQuality\?\.disposition === "retake"/);
  assert.match(source, /buildSemanticPublicationConstraintsV1\(\{/);
  assert.match(source, /external_color_authority: false/);
  assert.match(source, /authority_owner: "visioncore"/);
});
