import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../src/server.js", import.meta.url), "utf8");

test("failed targeted micro-crop refinement preserves accepted full-image identity", () => {
  assert.match(source, /identity_fallback_preserved/);
  assert.match(source, /failed refinement pass cannot erase an/);
  assert.doesNotMatch(
    source,
    /else if \(accessoryMicroCropRuntime\?\.locator\?\.skipped !== true\) \{\s*targetedAcceptedDetections = targetedAcceptedDetections\.filter/
  );
});
