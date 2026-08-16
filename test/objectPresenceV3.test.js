import test from "node:test";
import assert from "node:assert/strict";
import { analyzePerceptionV6 } from "../src/intelligence/perceptionV6/index.js";

function image(width, height, painter) {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const [r,g,b] = painter(x,y); const i=(y*width+x)*4;
    data[i]=r; data[i+1]=g; data[i+2]=b; data[i+3]=255;
  }
  return { width, height, data };
}

function run(decodedImage, confidence=.95) {
  const regions=[{ id:"market-headwear", zone:"accessory_jewelry", segment_label:"hat", confidence }];
  const perceptionV5={
    hypotheses:[{ region_index:0, strategy:"original", score:confidence }],
    normalized_regions:[{ normalized_box:{ x:.2,y:.05,w:.6,h:.35,x2:.8,y2:.4 } }],
    contradictions:[], arbitration:{ outcome:"accepted", confidence },
  };
  return analyzePerceptionV6({ perceptionV5, regions, decodedImage, mode:"assist" });
}

test("bare-head crop is withheld and detector confidence cannot qualify it", () => {
  const decoded=image(60,60,(x,y)=>{
    if(x>=12&&x<48&&y>=3&&y<24) {
      if(y<8) return x%6<3 ? [24,24,28] : [70,72,65];
      return [178,118,88];
    }
    return [198,165,138];
  });
  const result=run(decoded,.97);
  const validation=result.evidence_ledger[0].validation;
  assert.equal(result.evidence_ledger[0].accepted,false);
  assert.ok(validation.diagnostic_evidence.includes("detector_support"));
  assert.ok(!validation.qualifying_evidence.includes("detector_support"));
  assert.equal(result.object_presence.accessory_jewelry.present,false);
});

test("real dark headwear retains qualifying image evidence independent of detector support", () => {
  const decoded=image(50,50,(x,y)=>{
    if(x>=10&&x<40&&y>=3&&y<20) {
      if(y<12) return x%6<3?[18,18,22]:[48,48,55];
      return [175,112,82];
    }
    return [215,195,170];
  });
  const result=run(decoded,.91);
  const validation=result.evidence_ledger[0].validation;
  assert.equal(result.evidence_ledger[0].accepted,true);
  assert.ok(validation.structural_evidence.length>0);
  assert.ok(validation.qualifying_evidence.length>=validation.required_positive_evidence);
  assert.ok(!validation.qualifying_evidence.includes("detector_support"));
  assert.equal(validation.reason,"positive_headwear_object_presence");
});
