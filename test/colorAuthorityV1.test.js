import test from "node:test";
import assert from "node:assert/strict";
process.env.NODE_ENV="test";
const { buildOutfitAnalysis } = await import("../src/server.js");

function img(){
  const data=new Uint8Array(100*140*4);
  for(let y=0;y<140;y++) for(let x=0;x<100;x++){
    let c=[190,160,130];
    if(y>20&&y<65)c=[96,50,30];
    if(y>=65&&y<125)c=[78,96,79];
    const i=(y*100+x)*4; data.set([...c,255],i);
  }
  return {width:100,height:140,data};
}
const regions=[
 {id:"upper",source_type:"grounding_dino",zone:"upper_garment",label:"shirt",segment_label:"shirt",confidence:.95,coverage:.25,bounding_box:{x:.25,y:.15,width:.5,height:.3},dominant_hex:"#60321E",region_colors:[{hex:"#60321E",pct:.96}]},
 {id:"lower",source_type:"grounding_dino",zone:"lower_garment",label:"pants",segment_label:"pants",confidence:.95,coverage:.4,bounding_box:{x:.25,y:.48,width:.5,height:.42},dominant_hex:"#4E604F",region_colors:[{hex:"#4E604F",pct:.8}]},
];

test("published garment primaries become downstream color authority",()=>{
 const r=buildOutfitAnalysis({dominantHex:"#0D131E",topColors:[{hex:"#0D131E",pct:.67},{hex:"#4E604F",pct:.25},{hex:"#60321E",pct:.08}],segmentedRegions:regions,decodedImage:img(),perception_v6_mode:"assist"});
 assert.equal(r.color_authority.source,"published_garment_primaries");
 const authority=r.color_authority.colors.map(c=>c.hex.toUpperCase());
 assert.ok(authority.includes("#60321E"));
 assert.ok(authority.includes("#4E604F"));
 assert.match(r.why_this_works,/Rich Brown|Muted Forest Green/i);
});
