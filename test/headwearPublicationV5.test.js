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

function run(confidence) {
  const decoded=image(50,50,(x,y)=>{
    if(x>=10&&x<40&&y>=3&&y<20) {
      if(y<12) return x%6<3?[18,18,22]:[48,48,55];
      return [175,112,82];
    }
    return [215,195,170];
  });
  const regions=[{ id:"headwear-v5", zone:"accessory_jewelry", segment_label:"hat", confidence }];
  const perceptionV5={
    hypotheses:[{ region_index:0, strategy:"original", score:confidence }],
    normalized_regions:[{ normalized_box:{ x:.2,y:.05,w:.6,h:.35,x2:.8,y2:.4 } }],
    contradictions:[], arbitration:{ outcome:"accepted", confidence },
  };
  return analyzePerceptionV6({ perceptionV5, regions, decodedImage:decoded, mode:"assist" });
}

test("structured headwear at 78 percent is withheld under high-precision market policy", () => {
  const result=run(.78);
  const entry=result.evidence_ledger[0];
  assert.equal(entry.validation.supported,true);
  assert.equal(entry.accepted,false);
  assert.equal(entry.validation.reason,"insufficient_headwear_detector_confidence");
  assert.equal(result.publication_decisions[0].published,false);
});

test("real high-confidence dark headwear remains publishable", () => {
  const result=run(.91);
  const entry=result.evidence_ledger[0];
  assert.equal(entry.validation.supported,true);
  assert.equal(entry.accepted,true);
  assert.equal(entry.validation.reason,"positive_headwear_object_presence");
});
