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

function run(decodedImage, confidence=.9) {
  const regions=[{ id:"headwear-v3", zone:"accessory_jewelry", segment_label:"hat", confidence }];
  const perceptionV5={
    hypotheses:[{ region_index:0, strategy:"original", score:confidence }],
    normalized_regions:[{ normalized_box:{ x:.2,y:.05,width:.6,height:.35,x2:.8,y2:.4 } }],
    contradictions:[], arbitration:{ outcome:"accepted", confidence },
  };
  return analyzePerceptionV6({ perceptionV5, regions, decodedImage, mode:"assist" });
}

test("smooth dark hair cannot use generic object mass as headwear structure", () => {
  const decoded=image(60,60,(x,y)=>{
    if(x>=12&&x<48&&y>=4&&y<24) return y<15 ? [24,24,26] : [170,105,78];
    return [205,175,145];
  });
  const result=run(decoded,.92);
  const validation=result.evidence_ledger[0].validation;
  assert.equal(result.evidence_ledger[0].accepted,false);
  assert.ok(validation.positive_evidence.includes("object_pixel_mass"));
  assert.equal(validation.structural_evidence.includes("object_pixel_mass"), false);
});

test("textured headwear with boundary separation remains publishable", () => {
  const decoded=image(60,60,(x,y)=>{
    if(x>=12&&x<48&&y>=4&&y<24) {
      if(y<15) return x%8<4 ? [18,18,22] : [58,58,66];
      return [170,105,78];
    }
    return [215,195,175];
  });
  const result=run(decoded,.93);
  const validation=result.evidence_ledger[0].validation;
  assert.equal(result.evidence_ledger[0].accepted,true);
  assert.ok(validation.positive_evidence.includes("boundary_separation"));
  assert.ok(validation.structural_evidence.includes("upper_internal_edge_structure") || validation.structural_evidence.includes("object_dominant_crop"));
});

test("tight smooth headwear can publish when crop is object-dominant", () => {
  const decoded=image(60,60,(x,y)=>{
    if(x>=12&&x<48&&y>=4&&y<24) return y<20 ? [35,35,40] : [170,105,78];
    return [220,200,180];
  });
  const result=run(decoded,.93);
  const validation=result.evidence_ledger[0].validation;
  assert.equal(result.evidence_ledger[0].accepted,true);
  assert.ok(validation.structural_evidence.includes("object_dominant_crop"));
});
