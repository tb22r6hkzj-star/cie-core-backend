import test from "node:test";
import assert from "node:assert/strict";

process.env.NODE_ENV = "test";
const { buildOutfitAnalysis } = await import("../src/server.js");

test("Why This Works does not duplicate semantic descriptors already present in color names", () => {
  const analysis = buildOutfitAnalysis({
    dominantHex:"#284B35",
    topColors:[
      {hex:"#284B35",pct:.42,name:"Forest Green"},
      {hex:"#4E604F",pct:.28,name:"Muted Forest Green"},
      {hex:"#8B4A2B",pct:.20,name:"Rich Brown"},
      {hex:"#D3B99F",pct:.10,name:"Luxury Tan"},
    ],
    segmentedRegions:[],
    dinoGarmentRegions:[],
    perception_v6_mode:"assist",
    pipeline:{sam_enabled:false,dino_enabled:false},
  });
  assert.ok(analysis.why_this_works);
  assert.doesNotMatch(analysis.why_this_works, /\b(muted|balanced|deep|mid)\s+\1\b/i);
  assert.doesNotMatch(analysis.why_this_works, /muted\s+Muted/i);
});
