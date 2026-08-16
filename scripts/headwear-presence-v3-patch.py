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
    };
  }

  // Headwear must be proven by image evidence independently of the detector label.
  // Bare hair/face crops are especially dangerous because dark mass, internal
  // texture and detector confidence can otherwise reinforce the same hallucination.
  const materialPath =
    (r.object || 0) >= .18 &&
    pixels.contrast >= .055 &&
    (pixels.object_local_colors || []).some((color) => Number(color.pct || 0) >= .12);
  const darkObjectPath =
    (r.dark || 0) >= .28 &&
    pixels.contrast >= .075 &&
    (r.skin || 0) < .10 &&
    edgeDensity >= .02 && edgeDensity <= .45;
  const tissueMixture =
    (r.dark || 0) >= .35 &&
    (r.skin || 0) >= .08 &&
    (r.object || 0) < .20;

  const independentStructuralEvidence = [];
  if (materialPath) independentStructuralEvidence.push("material_separation");
  if (darkObjectPath) independentStructuralEvidence.push("coherent_dark_object_structure");
  const qualifyingEvidence = evidence.filter((item) => item !== "upper_internal_edge_structure");
  const requiredEvidence = 3;
  const supported =
    !tissueMixture &&
    independentStructuralEvidence.length > 0 &&
    qualifyingEvidence.length >= requiredEvidence;

  return {
    supported,
    score: clamp((qualifyingEvidence.length + independentStructuralEvidence.length) / 5),
    evidence: [...evidence, ...independentStructuralEvidence, ...diagnosticEvidence],
    qualifying_evidence: qualifyingEvidence,
    diagnostic_evidence: diagnosticEvidence,
    structural_evidence: independentStructuralEvidence,
    required_evidence: requiredEvidence,
    tissue_mixture_detected: tissueMixture,
  };
}
'''
text = text[:start] + new_block + text[end:]
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

test("textured bare hair cannot self-confirm headwear through detector support and internal edges", () => {
  const decoded=image(60,60,(x,y)=>{
    if(x>=12&&x<48&&y>=3&&y<24) {
      if(y>=18) return [176,112,82];
      return ((x+y)%5<2) ? [18,18,21] : [34,34,38];
    }
    return [198,165,138];
  });
  const result=run(decoded,.97);
  const validation=result.evidence_ledger[0].validation;
  assert.equal(result.evidence_ledger[0].accepted,false);
  assert.ok(validation.diagnostic_evidence.includes("detector_support"));
  assert.ok(!validation.qualifying_evidence.includes("detector_support"));
  assert.equal(validation.tissue_mixture_detected,true);
  assert.equal(result.object_presence.accessory_jewelry.present,false);
});

test("real dark headwear retains an independent image-evidence path", () => {
  const decoded=image(60,60,(x,y)=>{
    if(x>=12&&x<48&&y>=3&&y<22) {
      return x%8<4 ? [22,22,26] : [52,52,60];
    }
    if(x>=18&&x<42&&y>=22&&y<30) return [176,112,82];
    return [215,195,170];
  });
  const result=run(decoded,.91);
  const validation=result.evidence_ledger[0].validation;
  assert.equal(result.evidence_ledger[0].accepted,true);
  assert.equal(validation.tissue_mixture_detected,false);
  assert.ok(validation.structural_evidence.length>0);
  assert.equal(validation.reason,"positive_headwear_object_presence");
});
''')
