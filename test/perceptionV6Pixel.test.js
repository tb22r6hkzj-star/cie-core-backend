import test from "node:test";
import assert from "node:assert/strict";
import { analyzePerceptionV5 } from "../src/intelligence/perceptionV5/index.js";
import { analyzePerceptionV6 } from "../src/intelligence/perceptionV6/index.js";
process.env.NODE_ENV = "test";
const { buildOutfitAnalysis } = await import("../src/server.js");

const W=20,H=20;
function image(bg=[170,105,75], rect={x:6,y:5,w:8,h:4,color:[20,25,30]}) {
  const data=new Uint8Array(W*H*4);
  for(let y=0;y<H;y++) for(let x=0;x<W;x++){const c=x>=rect.x&&x<rect.x+rect.w&&y>=rect.y&&y<rect.y+rect.h?rect.color:bg; const i=(y*W+x)*4; data.set([...c,255],i);}
  return {width:W,height:H,data};
}
const base={dominantHex:"#334455",topColors:[{hex:"#334455",pct:.7},{hex:"#eeeeee",pct:.3}]};
const eyewear={id:"glasses",source_type:"grounding_dino",zone:"eyewear",label:"glasses",segment_label:"glasses",confidence:.95,coverage:.08,bbox:[.3,.25,.4,.2],dominant_hex:"#15191e",region_colors:[{hex:"#15191e",pct:.8}]};
const hat={id:"hat",source_type:"grounding_dino",zone:"accessory_jewelry",label:"hat",segment_label:"hat",confidence:.93,coverage:.12,bbox:[.25,.05,.5,.2],dominant_hex:"#223344",region_colors:[{hex:"#223344",pct:.8}]};
const run=(region,decodedImage,mode="shadow")=>buildOutfitAnalysis({...base,segmentedRegions:[region],decodedImage,perception_v6_mode:mode});

test("decoded image supplies crop-local pixels through buildOutfitAnalysis",()=>{const r=run(eyewear,image()); const e=r.perception_v6.evidence_ledger[0]; assert.equal(r.perception_v6.decoded_image_valid,true); assert.ok(e.pixel_evidence.sample_count>0); assert.ok(e.pixel_evidence.contrast>.05); assert.notEqual(e.object_local_colors[0]?.hex,eyewear.region_colors[0].hex);});
test("invalid decoded images are handled deterministically",()=>{const r=run(eyewear,{width:2,height:2,data:[1]},"bogus"); assert.equal(r.perception_v6_mode,"shadow"); assert.equal(r.perception_v6.decoded_image_valid,false); assert.equal(r.perception_v6.evidence_ledger[0].validation.reason,"detector_only_no_pixels");});
test("shadow preserves legacy publication while retaining a pixel rejection",()=>{const legacy=run(eyewear,null); const shadow=run(eyewear,image([170,105,75],{x:6,y:5,w:8,h:4,color:[190,125,95]})); assert.deepEqual(shadow.garment_zones.zones,legacy.garment_zones.zones); assert.equal(shadow.perception_v6.publication_decisions[0].published,false);});
test("assist suppresses contaminated eyewear",()=>{const r=run(eyewear,image([170,105,75],{x:6,y:5,w:8,h:4,color:[190,125,95]}),"assist"); assert.equal(r.garment_zones.zones.eyewear,undefined); assert.match(r.perception_v6.publication_decisions[0].reason,/skin|eyewear/);});
test("assist preserves strongly supported dark eyewear on dark skin",()=>{const r=run(eyewear,image([65,42,35],{x:6,y:5,w:8,h:4,color:[2,3,4]}),"assist"); assert.ok(r.garment_zones.zones.eyewear); assert.equal(r.perception_v6.object_presence.eyewear.present,true);});
test("authoritative publication is V6 reconciled rather than legacy passthrough",()=>{const r=run(eyewear,image(),"authoritative"); assert.deepEqual(Object.keys(r.garment_zones.zones),["eyewear"]); assert.ok(Object.keys(r.garment_zones.legacy_zones).length>1);});
test("skin contamination cannot replace eyewear object evidence",()=>{const r=run(eyewear,image([170,105,75],{x:6,y:5,w:8,h:4,color:[190,125,95]}),"authoritative"); assert.equal(r.perception_v6.object_presence.eyewear.present,false); assert.equal(r.garment_zones.zones.eyewear,undefined);});
test("white glare is excluded from authoritative accessory colors",()=>{const r=run(eyewear,image([80,55,45],{x:6,y:5,w:8,h:4,color:[255,255,255]}),"authoritative"); assert.equal(r.garment_zones.zones.eyewear,undefined); assert.ok(!r.perception_v6.evidence_ledger[0].object_local_colors.some(c=>c.hex.toLowerCase()==="#ffffff"));});
test("headwear is withheld when its crop lacks independent structural evidence",()=>{const dark=image([18,18,20],{x:5,y:1,w:10,h:4,color:[19,19,21]}); const r=run(hat,dark,"assist"); assert.equal(r.garment_zones.zones.accessory_jewelry,undefined); assert.equal(r.perception_v6.publication_decisions[0].reason,"insufficient_positive_headwear_evidence"); assert.deepEqual(r.perception_v6.publication_decisions[0].structural_evidence,[]);});
test("contrasting headwear survives positive object-presence checks",()=>{const r=run(hat,image([18,18,20],{x:5,y:1,w:10,h:4,color:[20,80,160]}),"assist"); assert.ok(r.garment_zones.zones.accessory_jewelry); assert.equal(r.perception_v6.publication_decisions[0].published,true); assert.ok(r.perception_v6.publication_decisions[0].structural_evidence.length>0);});
test("lifecycle records candidate, crop, pixel, color and publication stages",()=>{const r=run(eyewear,image()); assert.deepEqual(r.perception_v6.lifecycle_trace.map(x=>x.stage),["candidate_selection","crop_selection","pixel_validation","object_local_color_preservation","publication"]); assert.equal(r.perception_v6.lifecycle_trace.at(-1).decisions[0].id,"glasses");});
test("WP-01 records and garment-zone output remain available",()=>{const r=run(eyewear,image()); assert.equal(r.perception_v5.version,"5"); assert.equal(r.perception_v6.version,"6"); assert.ok(r.garment_zones.zones.upper_garment); assert.equal(r.perception_v5.arbitration.selected_region_id,"glasses");});

test("authoritative publication is enriched from the selected V6 reconciliation",()=>{
  const r=run(eyewear,image(),"authoritative");
  const published=r.garment_zones.zones.eyewear;
  assert.equal(published.label,"glasses");
  assert.deepEqual(published.evidence_ids,["glasses"]);
  assert.ok(published.object_local_colors.length>0);
  assert.equal(published.validation_decision,"accepted");
  assert.equal(published.publication_decision,"publish");
  assert.equal(published.reconciliation_result,"highest_pixel_validated_weighted_support");
  assert.equal(published.perception_source,"v6_reconciliation");
  assert.notDeepEqual(published,published.legacy_diagnostic);
});

test("authoritative mode honors the global publication gate even for pixel-accepted evidence",()=>{
  const primary={...eyewear,source_type:"segmentation",id:"glasses-v6",label:"glasses",segment_label:"glasses"};
  const rival={...eyewear,source_type:"segmentation",id:"sunglasses-v6",label:"sunglasses",segment_label:"sunglasses",confidence:.94};
  const result=buildOutfitAnalysis({...base,segmentedRegions:[primary,rival],decodedImage:image(),perception_v6_mode:"authoritative"});
  assert.equal(result.perception_v6.evidence_ledger[0].validation.accepted,true);
  assert.equal(result.perception_v6.publication_gating.allowed,false);
  assert.deepEqual(result.garment_zones.zones,{});
});

test("mixed eyewear crops retain dark object pixels without publishing skin pixels",()=>{
  const mixed=image([170,105,75],{x:6,y:5,w:4,h:4,color:[20,25,30]});
  const v5=analyzePerceptionV5({regions:[eyewear]});
  const v6=analyzePerceptionV6({perceptionV5:v5,regions:[eyewear],decodedImage:mixed});
  const evidence=v6.evidence_ledger[0];
  assert.equal(evidence.accepted,true);
  assert.ok(evidence.object_local_colors.some(c=>c.source_class==="dark"));
  assert.ok(!evidence.object_local_colors.some(c=>c.source_class==="skin"));
  assert.ok(evidence.pixel_evidence.ratios.skin>0);
});
