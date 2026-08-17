import test from "node:test";
import assert from "node:assert/strict";
const { resolveConsumerZonePrimary } = await import("../src/server.js");

test("trusted finalized primary wins only with confidence, consistency and corroboration",()=>{
  const r=resolveConsumerZonePrimary("lower_garment", {
    hex:"#4E604F", dominant_color:{hex:"#4E604F"}, signature_color:{hex:"#4E604F"}, confidence:75, decision_consistency:{valid:true}
  }, [{base:"#0D131E",pct:.67},{base:"#1E2E23",pct:.25},{base:"#4E604F",pct:.08}]);
  assert.equal(r.status,"resolved");
  assert.equal(r.source,"finalized_zone_primary");
  assert.equal(r.hex.toUpperCase(),"#4E604F");
  assert.equal(r.corroboration.signature,true);
});

test("low-confidence finalized color does not get forced over local evidence",()=>{
  const r=resolveConsumerZonePrimary("lower_garment", {
    hex:"#4E604F", dominant_color:{hex:"#4E604F"}, signature_color:{hex:"#4E604F"}, confidence:37, decision_consistency:{valid:true}
  }, [{base:"#0D131E",pct:.67},{base:"#4E604F",pct:.08}]);
  assert.notEqual(r.status,"resolved");
  assert.equal(r.source,"local_cluster_fallback");
  assert.equal(r.hex.toUpperCase(),"#0D131E");
});

test("invalid decision consistency prevents finalized primary from being forced",()=>{
  const r=resolveConsumerZonePrimary("upper_garment", {
    hex:"#60321E", dominant_color:{hex:"#60321E"}, signature_color:{hex:"#60321E"}, confidence:90, decision_consistency:{valid:false,issues:["conflict"]}
  }, [{base:"#20110B",pct:.56},{base:"#60321E",pct:.44}]);
  assert.notEqual(r.status,"resolved");
  assert.equal(r.source,"local_cluster_fallback");
});
