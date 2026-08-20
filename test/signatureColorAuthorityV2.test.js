import test from "node:test";
import assert from "node:assert/strict";
import { applySignatureColorAuthorityV2, reconcileSignatureColorV2 } from "../src/intelligence/signatureColorAuthorityV2.js";

function lowerZone({ primary = "#4E604F", signature = "#0A0D12", regionColors = [] } = {}) {
  return {
    hex: primary,
    primary_color: { hex: primary, pct: 1 },
    dominant_color: { hex: primary, pct: 0.98 },
    signature_color: signature ? { hex: signature, pct: 0.58 } : null,
    region_colors: regionColors,
  };
}

function upperZone({ primary = "#60321E", signature = "#20110B", regionColors = [] } = {}) {
  return {
    hex: primary,
    primary_color: { hex: primary, pct: 1 },
    dominant_color: { hex: primary, pct: 0.96 },
    signature_color: signature ? { hex: signature, pct: 0.56 } : null,
    region_colors: regionColors,
  };
}

test("rejects shadow-heavy lower-garment secondary as signature and falls back to primary", () => {
  const zone = lowerZone({
    regionColors: [
      { hex: "#3F5041", pct: 0.98, source: "lower_garment_purity_v2", body_share: 0.82, separator_share: 0.04, spatial_penalty: 1 },
      { hex: "#0A0D12", pct: 0.58, source: "lower_garment_purity_v2", body_share: 0.22, separator_share: 0.51, spatial_penalty: 0.42 },
    ],
  });
  const result = reconcileSignatureColorV2("lower_garment", zone);
  assert.equal(result.signature_color.hex, "#4E604F");
  assert.equal(result.signature_color_authority_v2.decision, "reject_unowned_secondary");
});

test("preserves a genuinely body-supported lower-garment secondary signature", () => {
  const zone = lowerZone({
    signature: "#C88A54",
    regionColors: [
      { hex: "#4E604F", pct: 0.62, source: "lower_garment_purity_v2", body_share: 0.76, separator_share: 0.05, spatial_penalty: 1 },
      { hex: "#C88A54", pct: 0.28, source: "lower_garment_purity_v2", body_share: 0.57, separator_share: 0.08, spatial_penalty: 1 },
    ],
  });
  const result = reconcileSignatureColorV2("lower_garment", zone);
  assert.equal(result.signature_color.hex, "#C88A54");
  assert.equal(result.signature_color_authority_v2.decision, "preserve_owned_secondary");
});

test("does not demote true black lower-garment primary", () => {
  const zone = lowerZone({ primary: "#0A0D12", signature: "#0A0D12", regionColors: [
    { hex: "#0A0D12", pct: 0.91, source: "lower_garment_purity_v2", body_share: 0.86, separator_share: 0.03, spatial_penalty: 1 },
  ] });
  const result = reconcileSignatureColorV2("lower_garment", zone);
  assert.equal(result.signature_color.hex, "#0A0D12");
  assert.equal(result.signature_color_authority_v2.decision, "preserve_primary_signature");
});

test("rejects boundary and underarm-heavy upper-garment dark secondary as signature", () => {
  const upper = upperZone({
    regionColors: [
      { hex: "#60321E", pct: 0.91, source: "upper_garment_purity_v1", body_share: 0.79, boundary_share: 0.12, underarm_share: 0.09, spatial_penalty: 1 },
      { hex: "#20110B", pct: 0.42, source: "upper_garment_purity_v1", body_share: 0.21, boundary_share: 0.49, underarm_share: 0.30, spatial_penalty: 0.42 },
    ],
  });
  const result = reconcileSignatureColorV2("upper_garment", upper);
  assert.equal(result.signature_color.hex, "#60321E");
  assert.equal(result.signature_color_authority_v2.decision, "reject_unowned_secondary");
});

test("preserves genuinely body-supported upper-garment secondary signature", () => {
  const upper = upperZone({
    signature: "#D5C2A8",
    regionColors: [
      { hex: "#60321E", pct: 0.61, source: "upper_garment_purity_v1", body_share: 0.74, boundary_share: 0.16, underarm_share: 0.10, spatial_penalty: 1 },
      { hex: "#D5C2A8", pct: 0.31, source: "upper_garment_purity_v1", body_share: 0.58, boundary_share: 0.24, underarm_share: 0.18, spatial_penalty: 1 },
    ],
  });
  const result = reconcileSignatureColorV2("upper_garment", upper);
  assert.equal(result.signature_color.hex, "#D5C2A8");
  assert.equal(result.signature_color_authority_v2.decision, "preserve_owned_secondary");
});

test("does not demote true black upper-garment primary", () => {
  const upper = upperZone({ primary: "#111111", signature: "#111111", regionColors: [
    { hex: "#111111", pct: 0.9, source: "upper_garment_purity_v1", body_share: 0.84, boundary_share: 0.10, underarm_share: 0.06, spatial_penalty: 1 },
  ] });
  const result = reconcileSignatureColorV2("upper_garment", upper);
  assert.equal(result.signature_color.hex, "#111111");
  assert.equal(result.signature_color_authority_v2.decision, "preserve_primary_signature");
});

test("applies to a zones map without removing non-garment zones", () => {
  const zones = {
    lower_garment: lowerZone({ regionColors: [
      { hex: "#4E604F", pct: 0.98, source: "lower_garment_purity_v2", body_share: 0.8, separator_share: 0.04, spatial_penalty: 1 },
      { hex: "#0A0D12", pct: 0.58, source: "lower_garment_purity_v2", body_share: 0.2, separator_share: 0.5, spatial_penalty: 0.42 },
    ] }),
    footwear: { hex: "#111111", signature_color: { hex: "#111111" } },
  };
  const result = applySignatureColorAuthorityV2(zones);
  assert.equal(result.lower_garment.signature_color.hex, "#4E604F");
  assert.deepEqual(result.footwear, zones.footwear);
});
