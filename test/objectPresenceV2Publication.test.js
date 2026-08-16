import test from "node:test";
import assert from "node:assert/strict";

process.env.NODE_ENV = "test";
const { buildOutfitAnalysis } = await import("../src/server.js");

function image(width, height, painter) {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const [r,g,b] = painter(x,y); const i=(y*width+x)*4;
    data[i]=r; data[i+1]=g; data[i+2]=b; data[i+3]=255;
  }
  return { width, height, data };
}

function buildMixedAccessoryFixture() {
  const decodedImage = image(100, 140, (x,y) => {
    // bare dark hair over face in the hat candidate crop
    if (x >= 30 && x < 70 && y >= 7 && y < 42) return y < 28 ? [22,22,24] : [176,114,84];
    // distinct necklace object in chest crop
    if (x >= 44 && x < 56 && y >= 62 && y < 88) return [155,118,48];
    return [205,183,157];
  });
  const regions = [
    {
      id:"hat-fp", source_type:"grounding_dino", zone:"accessory_jewelry",
      label:"hat", segment_label:"hat", category:"accessory", confidence:.90, coverage:.10,
      bounding_box:{x:.30,y:.05,width:.40,height:.25}, dominant_hex:"#161618",
      region_colors:[{hex:"#161618",pct:.78,name:"Deep Black"},{hex:"#B07254",pct:.18,name:"Brown"}],
    },
    {
      id:"necklace-real", source_type:"grounding_dino", zone:"accessory_jewelry",
      label:"necklace", segment_label:"necklace", category:"accessory", confidence:.84, coverage:.06,
      bounding_box:{x:.38,y:.42,width:.24,height:.24}, dominant_hex:"#9B7630",
      region_colors:[{hex:"#9B7630",pct:.74,name:"Antique Gold"}],
    },
  ];
  return buildOutfitAnalysis({
    dominantHex:"#8B4A2B",
    topColors:[
      {hex:"#8B4A2B",pct:.45,name:"Rust Brown"},
      {hex:"#284B35",pct:.35,name:"Forest Green"},
      {hex:"#151515",pct:.20,name:"Black"},
    ],
    segmentedRegions:regions,
    dinoGarmentRegions:[],
    decodedImage,
    perception_v6_mode:"assist",
    pipeline:{sam_enabled:false,dino_enabled:true},
  });
}

test("rejected headwear cannot borrow acceptance from real jewelry in the same canonical zone", () => {
  const analysis = buildMixedAccessoryFixture();
  const decisions = analysis.perception_v6.publication_decisions;
  const hat = decisions.find((d) => d.label === "hat");
  const necklace = decisions.find((d) => d.label === "necklace");
  assert.equal(hat?.published, false);
  assert.equal(necklace?.published, true);

  const accessory = analysis.garment_zones.zones.accessory_jewelry;
  assert.ok(accessory, "real jewelry should keep the accessory zone available");
  assert.notEqual(String(accessory.display_zone_label || "").toLowerCase(), "headwear");
  assert.notEqual(String(accessory.object_type || "").toLowerCase(), "hat");
  assert.equal(String(accessory.object_type || "").toLowerCase(), "necklace");
  assert.equal(accessory.perception_source, "v6_assist_identity_reconciliation");
});
