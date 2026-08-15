import test from "node:test";
import assert from "node:assert/strict";
import { analyzePerceptionV5, normalizeBoundingBox } from "../src/intelligence/perceptionV5/index.js";
import { analyzePerceptionV6 } from "../src/intelligence/perceptionV6/index.js";

process.env.NODE_ENV = "test";
const { buildOutfitAnalysis } = await import("../src/server.js");

const strong = { id: "shirt", source_type: "grounding_dino", zone: "upper_garment", label: "shirt", confidence: .92, coverage: .3, bbox: [100, 50, 200, 300], image_width: 500, image_height: 500, dominant_hex: "#123456" };
const weak = { id: "hat", source_type: "grounding_dino", zone: "accessory_jewelry", label: "hat", confidence: .35, coverage: .05, bbox: [.1, .05, .2, .1], dominant_hex: "#654321" };

test("V5 normalizes pixel and unit bounding boxes and rejects unusable geometry", () => {
  const box = normalizeBoundingBox(strong);
  assert.deepEqual({ ...box, width: Number(box.width.toFixed(6)) }, { x: .2, y: .1, width: .4, height: .6, x2: .6, y2: .7, normalized: true });
  assert.equal(normalizeBoundingBox({ bbox: [4, 3, 2, 1] }), null);
});

test("V5 evidence drives ranking, confidence separation, arbitration, and trace", () => {
  const result = analyzePerceptionV5({ regions: [weak, strong] });
  assert.equal(result.hypotheses[0].region_id, "shirt");
  assert.ok(result.hypotheses[0].score > result.hypotheses.find((h) => h.region_id === "hat").score);
  assert.ok(result.confidence_separation.margin > .2);
  assert.equal(result.arbitration.selected_region_id, "shirt");
  assert.equal(result.arbitration.outcome, "accepted");
  assert.equal(result.stability.stable, true);
  assert.deepEqual(result.decision_trace.map((entry) => entry.step), ["normalize", "hypothesize", "rank", "contradictions", "arbitrate"]);
});

test("V5 contradictions are recorded and penalize arbitration", () => {
  const rival = { ...strong, id: "coat", label: "coat", zone: "outerwear", confidence: .9 };
  const clean = analyzePerceptionV5({ regions: [strong] });
  const conflicted = analyzePerceptionV5({ regions: [strong, rival] });
  assert.equal(conflicted.contradictions[0].type, "zone_conflict");
  assert.ok(conflicted.contradictions[0].severity > 0);
  assert.ok(conflicted.arbitration.contradiction_penalty > 0);
  assert.ok(conflicted.arbitration.confidence < clean.arbitration.confidence);
  assert.equal(conflicted.stability.stable, false);
});

test("V6 consumes V5 evidence for ledger, presence, consensus, and reconciliation", () => {
  const secondShirt = { ...strong, id: "shirt-2", confidence: .8, bbox: [.22, .12, .35, .55] };
  const regions = [strong, secondShirt, weak];
  const v5 = analyzePerceptionV5({ regions });
  const v6 = analyzePerceptionV6({ perceptionV5: v5, regions });
  assert.equal(v6.evidence_ledger.length, 3);
  assert.equal(v6.evidence_ledger[0].geometry.normalized, true);
  assert.equal(v6.object_presence.upper_garment.present, true);
  assert.equal(v6.consensus.label, "shirt");
  assert.ok(v6.consensus.ratio > .5);
  assert.equal(v6.zone_reconciliation.find((item) => item.zone === "upper_garment").selected_label, "shirt");
  assert.equal(v6.contradiction_policy.inherited_from_v5, true);
  assert.deepEqual(v6.decision_trace.map((entry) => entry.step), ["ingest_v5", "ledger", "consensus", "reconcile", "publication_gate"]);
});

test("V6 publication gate permits strong evidence and blocks absent evidence", () => {
  const v5 = analyzePerceptionV5({ regions: [strong] });
  assert.equal(analyzePerceptionV6({ perceptionV5: v5, regions: [strong] }).publication_gating.allowed, true);
  const emptyV5 = analyzePerceptionV5({ regions: [] });
  const empty = analyzePerceptionV6({ perceptionV5: emptyV5, regions: [] });
  assert.equal(empty.publication_gating.allowed, false);
  assert.equal(empty.publication_gating.reason, "no_accepted_evidence");
});

test("buildOutfitAnalysis adds V5/V6 without changing garment-zone production output", () => {
  const input = { dominantHex: "#123456", topColors: [{ hex: "#123456", pct: .7 }, { hex: "#eeeeee", pct: .3 }], segmentedRegions: [strong], dinoGarmentRegions: [], pipeline: { dino_enabled: true } };
  const result = buildOutfitAnalysis(input);
  assert.equal(result.perception_v5.arbitration.selected_region_id, "shirt");
  assert.equal(result.perception_v6.evidence_ledger[0].id, "shirt");
  assert.ok(result.garment_zones?.zones?.upper_garment);
  assert.equal(result.garment_zones.zones.upper_garment.hex, "#123456");
  assert.equal(typeof result.outfit_score, "number");
});
