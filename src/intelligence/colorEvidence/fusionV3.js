import chroma from "chroma-js";

const AGREEMENT_DELTA_E = 18;

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function normalizeUnit(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return clamp01(n > 1 ? n / 100 : n);
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

function evidenceStateMultiplier(state) {
  if (state === "supported") return 1;
  if (state === "observed") return 0.72;
  if (state === "conflicted") return 0.35;
  return 0.5;
}

function finalizedReliability(zoneData = {}) {
  const confidence = normalizeUnit(zoneData?.confidence ?? zoneData?.score);
  const consistency = zoneData?.decision_consistency?.valid === false ? 0.25 : 1;
  const publicationAccepted = zoneData?.publication_decision !== "reject" && zoneData?.validation_decision !== "rejected";
  const accepted = publicationAccepted ? 1 : 0.2;
  const finalizedHex = safeHex(zoneData?.dominant_color?.hex || zoneData?.hex || "");
  const signatureHex = safeHex(zoneData?.signature_color?.hex || "");
  const signatureAgreement = finalizedHex && signatureHex && deltaE(finalizedHex, signatureHex) < AGREEMENT_DELTA_E ? 1 : 0;
  const supportAgreement = finalizedHex && Array.isArray(zoneData?.support_colors)
    ? zoneData.support_colors.some((c) => safeHex(c?.hex) && deltaE(finalizedHex, c.hex) < AGREEMENT_DELTA_E) ? 1 : 0
    : 0;
  const corroboration = Math.max(signatureAgreement, supportAgreement);

  return clamp01(
    confidence * 0.62 +
    consistency * 0.14 +
    accepted * 0.14 +
    corroboration * 0.10
  );
}

function pixelReliability(colorEvidence = {}) {
  if (!colorEvidence?.available && !colorEvidence?.consensus_hex) return 0;
  const purity = normalizeUnit(colorEvidence?.region_purity);
  const familyConsensus = normalizeUnit(colorEvidence?.family_consensus);
  const spread = colorEvidence?.spread_score == null ? familyConsensus : normalizeUnit(colorEvidence?.spread_score);
  const state = evidenceStateMultiplier(colorEvidence?.decision_state);
  return clamp01((purity * 0.45 + familyConsensus * 0.35 + spread * 0.20) * state);
}

function rawClusterReliability(cluster = {}) {
  const pct = normalizeUnit(cluster?.pct ?? cluster?.percentage ?? cluster?.display_pct);
  return clamp01(0.35 + pct * 0.55);
}

function buildSources({ zoneData = {}, clusters = [], colorEvidence = null } = {}) {
  const sources = [];
  const finalizedHex = safeHex(zoneData?.dominant_color?.hex || zoneData?.hex || "");
  if (finalizedHex) {
    sources.push({
      id: "finalized_identity",
      kind: "identity",
      hex: finalizedHex,
      reliability: finalizedReliability(zoneData),
    });
  }

  const evidenceHex = safeHex(colorEvidence?.consensus_hex || "");
  if (evidenceHex) {
    sources.push({
      id: "pixel_consensus",
      kind: "pixel",
      hex: evidenceHex,
      reliability: pixelReliability(colorEvidence),
    });
  }

  const raw = clusters?.[0];
  const rawHex = safeHex(raw?.base || raw?.hex || "");
  if (rawHex) {
    sources.push({
      id: "raw_primary_cluster",
      kind: "raw_cluster",
      hex: rawHex,
      reliability: rawClusterReliability(raw),
    });
  }

  return sources.filter((source) => source.reliability > 0);
}

function addSourceToGroups(groups, source) {
  const matching = groups
    .map((group) => ({ group, distance: deltaE(group.anchor_hex, source.hex) }))
    .filter((entry) => entry.distance < AGREEMENT_DELTA_E)
    .sort((a, b) => a.distance - b.distance)[0];

  if (!matching) {
    groups.push({
      anchor_hex: source.hex,
      sources: [source],
    });
    return;
  }

  matching.group.sources.push(source);
  const strongest = matching.group.sources.slice().sort((a, b) => b.reliability - a.reliability)[0];
  matching.group.anchor_hex = strongest.hex;
}

function scoreGroup(group) {
  const independentKinds = new Set(group.sources.map((source) => source.kind));
  const complement = group.sources.reduce((remaining, source) => remaining * (1 - source.reliability * 0.65), 1);
  const score = clamp01(1 - complement);
  const strongest = group.sources.slice().sort((a, b) => b.reliability - a.reliability)[0];
  return {
    ...group,
    winner_hex: strongest.hex,
    score: Number(score.toFixed(3)),
    independent_source_count: independentKinds.size,
    source_ids: group.sources.map((source) => source.id),
  };
}

export function fuseColorEvidenceV3({ zoneData = {}, clusters = [], colorEvidence = null } = {}) {
  const sources = buildSources({ zoneData, clusters, colorEvidence });
  if (!sources.length) {
    return {
      available: false,
      version: "color_evidence_v3",
      decision_state: "unavailable",
      reason: "no_evidence_sources",
      sources: [],
      groups: [],
    };
  }

  const groups = [];
  for (const source of sources.slice().sort((a, b) => b.reliability - a.reliability)) {
    addSourceToGroups(groups, source);
  }

  const ranked = groups.map(scoreGroup).sort((a, b) => b.score - a.score);
  const winner = ranked[0];
  const runnerUp = ranked[1] || null;
  const margin = winner ? winner.score - Number(runnerUp?.score || 0) : 0;
  const supported = !!winner && winner.score >= 0.72 && winner.independent_source_count >= 2 && margin >= 0.12;
  const observed = !!winner && winner.score >= 0.52;

  return {
    available: true,
    version: "color_evidence_v3",
    decision_state: supported ? "supported" : observed ? "observed" : "conflicted",
    winner_hex: winner?.winner_hex || null,
    winner_score: winner?.score || 0,
    runner_up_score: runnerUp?.score || 0,
    decision_margin: Number(margin.toFixed(3)),
    independent_source_count: winner?.independent_source_count || 0,
    winning_sources: winner?.source_ids || [],
    sources: sources.map((source) => ({
      ...source,
      reliability: Number(source.reliability.toFixed(3)),
    })),
    groups: ranked.map((group) => ({
      winner_hex: group.winner_hex,
      score: group.score,
      independent_source_count: group.independent_source_count,
      source_ids: group.source_ids,
    })),
    policy: {
      agreement_delta_e: AGREEMENT_DELTA_E,
      supported_score_min: 0.72,
      supported_margin_min: 0.12,
      supported_independent_sources_min: 2,
    },
  };
}
