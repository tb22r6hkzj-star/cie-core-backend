import test from "node:test";
import assert from "node:assert/strict";
import { attachColorEvidenceToZones } from "../src/intelligence/colorEvidence/index.js";
import { resolveConsumerZonePrimary } from "../src/server.js";

function solidImage(hex, width = 40, height = 40) {
  const value = hex.replace("#", "");
  const rgb = [0, 2, 4].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16));
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = rgb[0];
    data[i + 1] = rgb[1];
    data[i + 2] = rgb[2];
    data[i + 3] = 255;
  }
  return { width, height, data };
}

function region(zone, rawHex, pct = 0.76) {
  return {
    zone,
    confidence: 91,
    bounding_box: { x: 0, y: 0, width: 1, height: 1 },
    region_colors: [{ hex: rawHex, pct }],
  };
}

test("V3 handoff publishes to the returned downstream zone without mutating the caller input", () => {
  const zones = {
    lower_garment: {
      hex: "#60321E",
      dominant_color: { hex: "#60321E" },
      primary_color: { hex: "#60321E" },
      confidence: 96,
      publication_decision: "reject",
      decision_consistency: { valid: false },
      signature_color: null,
    },
  };

  const originalZone = zones.lower_garment;
  const attached = attachColorEvidenceToZones({
    zones,
    regions: [region("lower_garment", "#4E604F")],
    decodedImage: solidImage("#4E604F"),
  });

  assert.equal(attached.lower_garment.color_publication_v3.action, "publish_v3");
  assert.equal(attached.lower_garment.color_publication_v3.applied_to_zone, true);
  assert.equal(attached.lower_garment.hex, "#4E604F");
  assert.equal(attached.lower_garment.primary_color.hex, "#4E604F");
  assert.notEqual(attached.lower_garment, originalZone);
  assert.equal(zones.lower_garment.hex, "#60321E");
  assert.equal(zones.lower_garment.dominant_color.hex, "#60321E");
  assert.equal(zones.lower_garment.primary_color.hex, "#60321E");
});

test("V3 published color survives the existing consumer resolver while provenance remains attached to the zone", () => {
  const zones = {
    lower_garment: {
      hex: "#60321E",
      dominant_color: { hex: "#60321E" },
      primary_color: { hex: "#60321E" },
      confidence: 96,
      publication_decision: "reject",
      validation_decision: "rejected",
      decision_consistency: { valid: false },
      signature_color: null,
    },
  };

  const attached = attachColorEvidenceToZones({
    zones,
    regions: [region("lower_garment", "#4E604F", 0.76)],
    decodedImage: solidImage("#4E604F"),
  });
  const publishedZone = attached.lower_garment;
  const rawClusters = [{ base: "#4E604F", pct: 0.76 }];
  const consumer = resolveConsumerZonePrimary(
    "lower_garment",
    publishedZone,
    rawClusters,
    publishedZone.color_evidence_v1
  );

  assert.equal(publishedZone.color_publication_v3.action, "publish_v3");
  assert.equal(publishedZone.color_publication_v3.applied_to_zone, true);
  assert.equal(publishedZone.hex, "#4E604F");
  assert.equal(consumer.hex, "#4E604F");
  assert.equal(consumer.source, "color_evidence_v3_publication");
  assert.equal(publishedZone.color_evidence_v1.color_publication_v3.action, "publish_v3");
  assert.equal(publishedZone.color_evidence_v1.color_publication_v3.hex, "#4E604F");
});

test("V3 handoff does not replace the downstream zone when V3 does not publish a different color", () => {
  const zones = {
    upper_garment: {
      hex: "#60321E",
      dominant_color: { hex: "#60321E" },
      primary_color: { hex: "#60321E" },
      confidence: 78,
      publication_decision: "publish",
      decision_consistency: { valid: true },
      signature_color: { hex: "#60321E" },
    },
  };

  const attached = attachColorEvidenceToZones({
    zones,
    regions: [region("upper_garment", "#263C69", 0.74)],
    decodedImage: solidImage("#4E604F"),
  });

  assert.ok(["preserve_current", "confirm_current"].includes(attached.upper_garment.color_publication_v3.action));
  assert.equal(attached.upper_garment.color_publication_v3.applied_to_zone, false);
  assert.equal(attached.upper_garment.hex, "#60321E");
  assert.equal(attached.upper_garment.primary_color.hex, "#60321E");
  assert.equal(zones.upper_garment.hex, "#60321E");
  assert.equal(zones.upper_garment.primary_color.hex, "#60321E");
});

test("market regression: finalized green lower garment remains the consumer primary while raw black stays evidence", () => {
  const zones = {
    lower_garment: {
      hex: "#4E604F",
      dominant_color: { hex: "#4E604F", pct: 1 },
      primary_color: { hex: "#4E604F" },
      signature_color: { hex: "#4E604F" },
      confidence: 75,
      publication_decision: "publish",
      validation_decision: "accepted",
      decision_consistency: { valid: true },
    },
  };

  const attached = attachColorEvidenceToZones({
    zones,
    regions: [region("lower_garment", "#0D131E", 0.67)],
    decodedImage: solidImage("#4E604F"),
  });
  const zone = attached.lower_garment;
  const rawClusters = [{ base: "#0D131E", pct: 0.67 }, { base: "#4F3E30", pct: 0.08 }];
  const consumer = resolveConsumerZonePrimary(
    "lower_garment",
    zone,
    rawClusters,
    zone.color_evidence_v1
  );

  assert.equal(zone.hex, "#4E604F");
  assert.equal(zone.primary_color.hex, "#4E604F");
  assert.equal(rawClusters[0].base, "#0D131E");
  assert.equal(consumer.hex, "#4E604F");
  assert.notEqual(consumer.source, "local_cluster_fallback");
});
