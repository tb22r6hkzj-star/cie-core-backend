import chroma from "chroma-js";

function clamp01(v) {
  return Math.max(0, Math.min(1, Number(v) || 0));
}

function safeHex(hex) {
  try {
    return chroma(hex).hex().toUpperCase();
  } catch {
    return null;
  }
}

function deltaE(a, b) {
  try {
    return chroma.distance(a, b, "lab");
  } catch {
    return 100;
  }
}

function normalizeSample(sample) {
  const hex = safeHex(sample?.hex || "");
  if (!hex) return null;
  return {
    id: sample?.id || null,
    hex,
    family: sample?.family || null,
    sample_count: Number(sample?.sample_count || 0),
  };
}

function representativeHex(samples = []) {
  const valid = samples.map(normalizeSample).filter(Boolean);
  if (!valid.length) return null;
  let best = valid[0];
  let bestScore = Infinity;
  for (const candidate of valid) {
    const score = valid.reduce((sum, other) => sum + deltaE(candidate.hex, other.hex), 0);
    if (score < bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best.hex;
}

export function evaluateSceneBoundaryPurityV1({
  interiorSamples = [],
  boundarySamples = [],
  garmentHex = null,
} = {}) {
  const interior = interiorSamples.map(normalizeSample).filter(Boolean);
  const boundary = boundarySamples.map(normalizeSample).filter(Boolean);
  const interiorHex = representativeHex(interior) || safeHex(garmentHex || "");
  const boundaryHex = representativeHex(boundary);

  if (!interiorHex) {
    return {
      available: false,
      version: "scene_boundary_purity_v1",
      reason: "missing_interior_evidence",
    };
  }

  const boundaryDeltaE = boundaryHex ? deltaE(interiorHex, boundaryHex) : null;
  const garmentAgreement = safeHex(garmentHex || "")
    ? clamp01(1 - deltaE(interiorHex, garmentHex) / 45)
    : null;

  const boundarySeparation = boundaryDeltaE === null ? 1 : clamp01(boundaryDeltaE / 30);
  const boundaryRisk = boundaryDeltaE === null ? 0 : clamp01(1 - boundaryDeltaE / 30);
  const interiorSupport = garmentAgreement === null ? 1 : garmentAgreement;
  const purityScore = clamp01(interiorSupport * 0.7 + boundarySeparation * 0.3);

  const contextCandidates = boundary
    .filter((sample) => deltaE(interiorHex, sample.hex) >= 18)
    .map((sample) => ({
      hex: sample.hex,
      family: sample.family,
      source: "boundary_context",
    }));

  return {
    available: true,
    version: "scene_boundary_purity_v1",
    interior_hex: interiorHex,
    boundary_hex: boundaryHex,
    boundary_delta_e: boundaryDeltaE === null ? null : Number(boundaryDeltaE.toFixed(2)),
    garment_agreement: garmentAgreement === null ? null : Number(garmentAgreement.toFixed(3)),
    boundary_separation: Number(boundarySeparation.toFixed(3)),
    boundary_contamination_risk: Number(boundaryRisk.toFixed(3)),
    region_purity: Number(purityScore.toFixed(3)),
    decision_state:
      purityScore >= 0.78 && boundaryRisk <= 0.45
        ? "clean"
        : purityScore >= 0.58
          ? "mixed"
          : "contaminated",
    scene_context_candidates: contextCandidates,
    policy: {
      garment_authority_source: "interior_evidence",
      boundary_role: "context_only",
      scene_context_delta_e_min: 18,
    },
  };
}
