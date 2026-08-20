import test from "node:test";
import assert from "node:assert/strict";
import { evaluateColorPublicationV3 } from "../src/intelligence/colorEvidence/publicationPolicyV3.js";

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

test("publication V3 replaces contaminated current color when two independent sources support winner", () => {
  const result = evaluateColorPublicationV3({
    zoneData: zone("#4E604F", 75),
    clusters: [{ base: "#0D131E", pct: 0.67 }, { base: "#4E604F", pct: 0.25 }],
    colorEvidence: supportedEvidence("#4E604F"),
    currentResolution: { hex: "#0D131E", source: "raw_primary_cluster" },
  });

  assert.equal(result.action, "publish_v3");
  assert.equal(result.hex, "#4E604F");
  assert.equal(result.source, "color_evidence_v3_fusion");
});

test("publication V3 preserves an already-correct current resolution when only one upstream lineage supports it", () => {
  const result = evaluateColorPublicationV3({
    zoneData: zone("#27486B", 92),
    clusters: [{ base: "#27486B", pct: 0.82 }],
    colorEvidence: supportedEvidence("#4E604F", { region_purity: 0.96, spread_score: 0.96 }),
    currentResolution: { hex: "#27486B", source: "trusted_finalized_identity" },
  });

  assert.equal(result.action, "preserve_current");
  assert.equal(result.hex, "#27486B");
  assert.equal(result.source, "trusted_finalized_identity");
  assert.equal(result.fusion.evidence_lineage_count, 1);
  assert.deepEqual(result.fusion.evidence_lineages, ["legacy_zone_pipeline"]);
});

test("publication V3 confirms an already-correct current resolution when independent pixel evidence agrees", () => {
  const result = evaluateColorPublicationV3({
    zoneData: zone("#27486B", 92),
    clusters: [{ base: "#27486B", pct: 0.82 }],
    colorEvidence: supportedEvidence("#27486B", { region_purity: 0.96, spread_score: 0.96 }),
    currentResolution: { hex: "#27486B", source: "trusted_finalized_identity" },
  });

  assert.equal(result.action, "confirm_current");
  assert.equal(result.hex, "#27486B");
  assert.equal(result.source, "trusted_finalized_identity");
  assert.equal(result.fusion.evidence_lineage_count, 2);
  assert.ok(result.fusion.winning_sources.includes("pixel_consensus"));
});

test("publication V3 preserves current resolution when evidence lacks independent agreement", () => {
  const result = evaluateColorPublicationV3({
    zoneData: zone("#60321E", 78),
    clusters: [{ base: "#263C69", pct: 0.74 }],
    colorEvidence: supportedEvidence("#4E604F"),
    currentResolution: { hex: "#263C69", source: "raw_primary_cluster" },
  });

  assert.equal(result.action, "preserve_current");
  assert.equal(result.hex, "#263C69");
});

test("publication V3 can override a rejected finalized identity when pixel and raw evidence independently agree", () => {
  const result = evaluateColorPublicationV3({
    zoneData: zone("#60321E", 96, {
      publication_decision: "reject",
      decision_consistency: { valid: false },
      signature_color: null,
    }),
    clusters: [{ base: "#4E604F", pct: 0.76 }],
    colorEvidence: supportedEvidence("#4E604F"),
    currentResolution: { hex: "#60321E", source: "finalized_identity" },
  });

  assert.equal(result.action, "publish_v3");
  assert.equal(result.hex, "#4E604F");
  assert.ok(!result.fusion.winning_sources.includes("finalized_identity"));
});
