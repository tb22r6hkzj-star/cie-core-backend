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

function run(decodedImage, confidence=.88) {
  const regions=[{ id:"headwear-1", zone:"accessory_jewelry", segment_label:"hat", confidence }];
  const perceptionV5={
    hypotheses:[{ region_index:0, strategy:"original", score:confidence }],
    normalized_regions:[{ normalized_box:{ x:.2,y:.05,w:.6,h:.35,x2:.8,y2:.4 } }],
    contradictions:[], arbitration:{ outcome:"accepted", confidence },
  };
  return analyzePerceptionV6({ perceptionV5, regions, decodedImage, mode:"assist" });
}

test("bare dark hair is withheld when positive headwear evidence is insufficient", () => {
  const decoded=image(50,50,(x,y)=>{
    if(x>=10&&x<40&&y>=3&&y<20) return y<15?[20,20,22]:[175,112,82];
    return [190,150,120];
  });
  const result=run(decoded);
  assert.equal(result.evidence_ledger[0].accepted,false);
  assert.equal(result.evidence_ledger[0].validation.reason,"insufficient_positive_headwear_evidence");
});

test("real dark headwear survives when independent positive evidence is present", () => {
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
  assert.equal(validation.reason,"positive_headwear_object_presence");
  assert.ok(validation.positive_evidence.length>=3);
});

test("headwear publication exposes owned positive-evidence chain", () => {
  const decoded=image(40,40,(x,y)=> x>8&&x<32&&y>3&&y<15 ? [55,55,62] : [210,185,155]);
  const result=run(decoded,.9);
  const decision=result.publication_decisions[0];
  assert.ok(Array.isArray(decision.positive_evidence));
  assert.ok(decision.positive_evidence.includes("detector_support"));
});
