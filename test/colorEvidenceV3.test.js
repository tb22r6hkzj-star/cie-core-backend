import test from "node:test";
import assert from "node:assert/strict";
import { fuseColorEvidenceV3 } from "../src/intelligence/colorEvidence/fusionV3.js";

function zone(hex, confidence = 75, extra = {}) {
  return {
    hex,
    dominant_color: { hex },
    confidence,
    decision_consistency: { valid: true },
    publication_decision: "publish",
    signature_color: { hex },
    ...extra,
  };
}

function supportedEvidence(hex, overrides = {}) {
  return {
    available: true,
    decision_state: "supported",
    region_purity: 0.91,
    family_consensus: 1,
    spread_score: 0.9,
    consensus_hex: hex,
    ...overrides,
  };
}

test("V3 fuses independent pixel and finalized identity evidence against a contaminated raw cluster", () => {
  const result = fuseColorEvidenceV3({
    zoneData: zone("#4E604F", 75),
    clusters: [{ base: "#0D131E", pct: 0.67 }, { base: "#4E604F", pct: 0.25 }],
    colorEvidence: supportedEvidence("#4E604F"),
  });

  assert.equal(result.version, "color_evidence_v3");
  assert.equal(result.decision_state, "supported");
  assert.equal(result.winner_hex, "#4E604F");
  assert.ok(result.winning_sources.includes("pixel_consensus"));
  assert.ok(result.winning_sources.includes("finalized_identity"));
  assert.equal(result.independent_source_count, 2);
  assert.ok(result.decision_margin >= 0.12);
});

test("V3 prevents one strong pixel source from defeating two independent agreeing sources", () => {
  const result = fuseColorEvidenceV3({
    zoneData: zone("#27486B", 92),
    clusters: [{ base: "#27486B", pct: 0.82 }],
    colorEvidence: supportedEvidence("#4E604F", { region_purity: 0.96, spread_score: 0.96 }),
  });

  assert.equal(result.decision_state, "supported");
  assert.equal(result.winner_hex, "#27486B");
  assert.ok(result.winning_sources.includes("finalized_identity"));
  assert.ok(result.winning_sources.includes("raw_primary_cluster"));
  assert.ok(!result.winning_sources.includes("pixel_consensus"));
});

test("V3 withholds supported authority when all evidence sources disagree", () => {
  const result = fuseColorEvidenceV3({
    zoneData: zone("#60321E", 78),
    clusters: [{ base: "#263C69", pct: 0.74 }],
    colorEvidence: supportedEvidence("#4E604F"),
  });

  assert.notEqual(result.decision_state, "supported");
  assert.equal(result.independent_source_count, 1);
  assert.equal(result.winning_sources.length, 1);
});

test("V3 downweights rejected finalized identity instead of treating confidence alone as authority", () => {
  const result = fuseColorEvidenceV3({
    zoneData: zone("#60321E", 96, {
      publication_decision: "reject",
      decision_consistency: { valid: false },
      signature_color: null,
    }),
    clusters: [{ base: "#4E604F", pct: 0.76 }],
    colorEvidence: supportedEvidence("#4E604F"),
  });

  assert.equal(result.decision_state, "supported");
  assert.equal(result.winner_hex, "#4E604F");
  assert.ok(result.winning_sources.includes("pixel_consensus"));
  assert.ok(result.winning_sources.includes("raw_primary_cluster"));
  assert.ok(!result.winning_sources.includes("finalized_identity"));
});

test("V3 returns unavailable when every candidate color is missing or invalid", () => {
  const result = fuseColorEvidenceV3({
    zoneData: { dominant_color: { hex: "not-a-color" }, confidence: 90 },
    clusters: [{ base: "also-not-a-color", pct: 0.9 }],
    colorEvidence: { available: true, consensus_hex: "invalid", decision_state: "supported" },
  });

  assert.equal(result.available, false);
  assert.equal(result.decision_state, "unavailable");
  assert.equal(result.reason, "no_evidence_sources");
  assert.deepEqual(result.sources, []);
});

test("V3 normalizes percentage and unit confidence identically", () => {
  const percent = fuseColorEvidenceV3({ zoneData: zone("#4E604F", 75) });
  const unit = fuseColorEvidenceV3({ zoneData: zone("#4E604F", 0.75) });

  const percentIdentity = percent.sources.find((source) => source.id === "finalized_identity");
  const unitIdentity = unit.sources.find((source) => source.id === "finalized_identity");
  assert.equal(percentIdentity.reliability, unitIdentity.reliability);
});

test("V3 keeps the LAB agreement boundary strict at delta E 18", () => {
  const inside = fuseColorEvidenceV3({
    zoneData: zone("#4E604F", 100),
    clusters: [{ base: "#7A7A7A", pct: 0.9 }],
  });
  const outside = fuseColorEvidenceV3({
    zoneData: zone("#4E604F", 100),
    clusters: [{ base: "#3E3E3E", pct: 0.9 }],
  });

  assert.equal(inside.policy.agreement_delta_e, 18);
  assert.equal(inside.independent_source_count, 2);
  assert.equal(inside.decision_state, "supported");
  assert.equal(outside.independent_source_count, 1);
  assert.notEqual(outside.decision_state, "supported");
});

test("V3 observed pixel evidence cannot manufacture supported authority with one agreeing raw stream", () => {
  const result = fuseColorEvidenceV3({
    clusters: [{ base: "#4E604F", pct: 0.76 }],
    colorEvidence: supportedEvidence("#4E604F", { decision_state: "observed" }),
  });

  assert.notEqual(result.decision_state, "supported");
  assert.equal(result.independent_source_count, 2);
  assert.ok(result.winning_sources.includes("pixel_consensus"));
  assert.ok(result.winning_sources.includes("raw_primary_cluster"));
});

test("V3 does not allow bridge evidence to create transitive consensus between endpoints beyond delta E", () => {
  const result = fuseColorEvidenceV3({
    zoneData: zone("#4E604F", 100),
    clusters: [{ base: "#899A81", pct: 0.76 }],
    colorEvidence: supportedEvidence("#62735F"),
  });

  assert.equal(result.decision_state, "supported");
  assert.ok(result.winning_sources.includes("finalized_identity"));
  assert.ok(result.winning_sources.includes("pixel_consensus"));
  assert.ok(!result.winning_sources.includes("raw_primary_cluster"));
  assert.equal(result.independent_source_count, 2);
});
