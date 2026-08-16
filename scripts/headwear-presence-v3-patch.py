from pathlib import Path

path = Path('src/intelligence/perceptionV6/index.js')
text = path.read_text()
start = text.index('function evaluatePositiveObjectPresence(entry, pixels) {')
end = text.index('\nfunction validateObject(entry, pixels) {', start)
new_block = r'''function evaluatePositiveObjectPresence(entry, pixels) {
  const label = `${entry.label} ${entry.zone}`.toLowerCase();
  const r = pixels.ratios || {};
  const evidence = [];
  const diagnosticEvidence = [];
  const objectShare = (r.object || 0) + (r.dark || 0);
  const edgeDensity = Number(pixels.spatial_structure?.upper_internal_edge_density || 0);
  const isHeadwear = /hat|cap|beanie|headwear/.test(label);

  if (pixels.contrast >= .055) evidence.push("boundary_separation");
  if ((r.object || 0) >= .22) evidence.push("object_pixel_mass");
  if ((r.dark || 0) >= .12 && pixels.contrast >= .075) evidence.push("structured_dark_mass");
  if ((pixels.object_local_colors || []).some((color) => Number(color.pct || 0) >= .12)) evidence.push("coherent_object_color");
  if (entry.confidence >= .62) diagnosticEvidence.push("detector_support");
  if (objectShare >= .38 && (r.skin || 0) < .50 && (r.highlight || 0) < .50) evidence.push("crop_occupancy");
  if (edgeDensity >= .08) evidence.push("upper_internal_edge_structure");

  if (!isHeadwear) {
    const requiredEvidence = 2;
    return {
      supported: evidence.length >= requiredEvidence,
      score: clamp(evidence.length / 4),
      evidence: [...evidence, ...diagnosticEvidence],
      qualifying_evidence: evidence,
      diagnostic_evidence: diagnosticEvidence,
      structural_evidence: evidence.filter((item) => ["upper_internal_edge_structure", "object_pixel_mass"].includes(item)),
      required_evidence: requiredEvidence,
      skin_dominant_head_crop: false,
    };
  }

  // Detector confidence may describe a candidate, but it cannot prove headwear.
  // A skin-dominant crop with limited dark material is characteristic of a
  // bare head/face crop and must be withheld even when DINO labels it as a hat.
  const skinDominantHeadCrop = (r.skin || 0) > .55 && (r.dark || 0) < .30;
  const structuralSignals = ["upper_internal_edge_structure", "object_pixel_mass"];
  const structuralEvidence = evidence.filter((item) => structuralSignals.includes(item));
  const requiredEvidence = 2;
  const supported = !skinDominantHeadCrop && evidence.length >= requiredEvidence && structuralEvidence.length > 0;

  return {
    supported,
    score: clamp(evidence.length / 4),
    evidence: [...evidence, ...diagnosticEvidence],
    qualifying_evidence: evidence,
    diagnostic_evidence: diagnosticEvidence,
    structural_evidence: structuralEvidence,
    required_evidence: requiredEvidence,
    skin_dominant_head_crop: skinDominantHeadCrop,
  };
}
'''
text = text[:start] + new_block + text[end:]

old_headwear_return = r'''    return {
      supported,
      accepted: supported && entry.confidence >= .35,
      reason: supported ? "positive_headwear_object_presence" : contamination[0] || "insufficient_positive_headwear_evidence",
      contamination,
      positive_evidence: presence.evidence,
      structural_evidence: presence.structural_evidence,
      object_presence_score: presence.score,
      required_positive_evidence: presence.required_evidence,
    };
'''
new_headwear_return = r'''    return {
      supported,
      accepted: supported && entry.confidence >= .35,
      reason: supported ? "positive_headwear_object_presence" : contamination[0] || "insufficient_positive_headwear_evidence",
      contamination,
      positive_evidence: presence.evidence,
      qualifying_evidence: presence.qualifying_evidence || [],
      diagnostic_evidence: presence.diagnostic_evidence || [],
      structural_evidence: presence.structural_evidence,
      object_presence_score: presence.score,
      required_positive_evidence: presence.required_evidence,
      skin_dominant_head_crop: !!presence.skin_dominant_head_crop,
    };
'''
if old_headwear_return not in text:
    raise SystemExit('headwear validation return anchor missing')
text = text.replace(old_headwear_return, new_headwear_return, 1)
path.write_text(text)

Path('test/objectPresenceV3.test.js').write_text(r'''import test from "node:test";
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
''')
