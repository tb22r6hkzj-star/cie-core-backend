import test from "node:test";
import assert from "node:assert/strict";
process.env.NODE_ENV="test";
const { resolveConsumerZonePrimary } = await import("../src/server.js");

function zone(hex, confidence=75){ return { hex, dominant_color:{hex}, confidence, decision_consistency:{valid:true}, publication_decision:"publish", signature_color:{hex} }; }

test("strong green consensus corrects dark-neutral raw contamination",()=>{
 const r=resolveConsumerZonePrimary("lower_garment", zone("#4E604F",75), [{base:"#0D131E",pct:.67},{base:"#4E604F",pct:.25}], {decision_state:"supported",region_purity:.91,family_consensus:1,consensus_family:"green",consensus_hex:"#4E604F"});
 assert.equal(r.hex.toUpperCase(),"#4E604F");
 assert.equal(r.source,"color_evidence_v2_consensus");
});

test("weak evidence cannot override raw cluster",()=>{
 const r=resolveConsumerZonePrimary("lower_garment", { ...zone("#4E604F",55), signature_color:null, support_colors:[] }, [{base:"#0D131E",pct:.67},{base:"#4E604F",pct:.25}], {decision_state:"observed",region_purity:.62,family_consensus:.6,consensus_family:"green",consensus_hex:"#4E604F"});
 assert.equal(r.hex.toUpperCase(),"#0D131E");
 assert.notEqual(r.source,"color_evidence_v2_consensus");
});

test("strong evidence does not override a chromatic raw primary unless it agrees with finalized identity",()=>{
 const r=resolveConsumerZonePrimary("upper_garment", zone("#60321E",90), [{base:"#60321E",pct:.8}], {decision_state:"supported",region_purity:.94,family_consensus:1,consensus_family:"green",consensus_hex:"#4E604F"});
 assert.equal(r.hex.toUpperCase(),"#60321E");
 assert.notEqual(r.source,"color_evidence_v2_consensus");
});
