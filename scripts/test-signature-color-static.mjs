import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/server.js", import.meta.url), "utf8");

assert.match(source, /function deriveSignatureColorDisplayRead\(zoneRead = \{\}, zoneKey = ""\)/);
assert.match(source, /const zoneRead = inferZoneColorRead\([\s\S]*?\);[\s\S]*?const signatureColor = deriveSignatureColorDisplayRead\(zoneRead, zoneKey\);[\s\S]*?zones\[zoneKey\] = \{[\s\S]*?\.\.\.zoneRead,[\s\S]*?signature_color: signatureColor,/);

// Keep signature_color display-only without confusing generic confidence fields such as
// zoneData.score with an actual outfit-scoring consumer. These patterns intentionally
// target named scoring surfaces rather than every occurrence of the token "score".
const forbiddenConsumers = [
  /signature_color[\s\S]{0,120}(scoreEngine|scoreOutfit|outfit_score|outfitScore|scoring)/i,
  /(scoreEngine|scoreOutfit|outfit_score|outfitScore|scoring)[\s\S]{0,120}signature_color/i,
  /signature_color[\s\S]{0,120}(detected_palette|color_roles|retrieval|recommendation)/i,
  /(detected_palette|color_roles|retrieval|recommendation)[\s\S]{0,120}signature_color/i,
];

for (const pattern of forbiddenConsumers) {
  assert.doesNotMatch(source, pattern);
}

const helperBody = source.match(/function deriveSignatureColorDisplayRead\([\s\S]*?\n\}\n\n\nfunction getColorSummaryName/)?.[0] || "";
assert.doesNotMatch(helperBody, /zoneRead\.[A-Za-z0-9_$]+\s*=/);
assert.doesNotMatch(helperBody, /zoneRead\?\.[A-Za-z0-9_$]+\s*=/);
assert.doesNotMatch(helperBody, /\.push\(|\.splice\(|\.sort\(/);
assert.match(helperBody, /region_colors/);
assert.match(helperBody, /dominant_color/);
assert.match(helperBody, /primary_color/);
assert.match(helperBody, /display_only: true/);

console.log("SIGNATURE COLOR STATIC TESTS PASSED");
