import { analyzePerceptionV6 } from "../intelligence/perceptionV6/index.js";

function normalizeColor(color) {
  if (!color) return null;
  if (typeof color === "string") return { hex: color };
  return color?.hex ? color : null;
}

function zoneEvidenceChain(perceptionV6, zone) {
  const ledger = (perceptionV6?.evidence_ledger || []).filter((row) => row?.zone === zone);
  const lifecycle = perceptionV6?.lifecycle_trace || [];
  const stages = [
    ...ledger.map((row) => ({
      stage: "pixel_validation",
      evidence_id: row.id,
      accepted: !!row.accepted,
      reason: row?.validation?.reason || null,
      contamination: row?.validation?.contamination || [],
    })),
    ...lifecycle.map((row) => ({ stage: row?.stage || "unknown" })),
    {
      stage: "publication_decision",
      allowed: !!perceptionV6?.publication_gating?.allowed,
      reason: perceptionV6?.publication_gating?.reason || null,
    },
  ];
  return stages;
}

export function adaptPerceptionV6ForEvaluation(perceptionV6 = {}) {
  const zones = {};
  const objectPresence = perceptionV6?.object_presence || {};
  const reconciled = new Map((perceptionV6?.zone_reconciliation || []).map((row) => [row?.zone, row]));

  for (const [zone, presence] of Object.entries(objectPresence)) {
    const colors = (presence?.object_local_colors || []).map(normalizeColor).filter(Boolean);
    const reconciliation = reconciled.get(zone) || {};
    const globallyAllowed = !!perceptionV6?.publication_gating?.allowed;
    const present = presence?.present === true;
    const published = globallyAllowed && present;
    const confidence = Number(presence?.confidence || 0);

    zones[zone] = {
      label: presence?.label || reconciliation?.selected_label || zone,
      primary_color: colors[0] || null,
      dominant_color: colors[0] || null,
      secondary_colors: colors.slice(1),
      unified_confidence: confidence,
      calibrated_confidence: confidence,
      raw_confidence: confidence,
      publication_state: published ? "confirmed" : "rejected",
      publication_reason: published
        ? "perception_v6_publication_gate_passed"
        : presence?.reason || perceptionV6?.publication_gating?.reason || "perception_v6_publication_gate_blocked",
      publication_reasons: {
        object_presence: presence?.reason || null,
        global_gate: perceptionV6?.publication_gating?.reason || null,
      },
      evidence_chain: zoneEvidenceChain(perceptionV6, zone),
      decision_consistency: {
        valid: true,
        issues: [],
      },
      decision_metrics: {
        evidence_count: Number(presence?.evidence_count || 0),
        publication_score: Number(perceptionV6?.publication_gating?.score || 0),
        consensus_ratio: Number(perceptionV6?.consensus?.ratio || 0),
      },
    };
  }

  return {
    perception_v6: perceptionV6,
    garment_zones: { zones },
    candidate_rankings: perceptionV6?.zone_reconciliation || [],
  };
}

export function createProductionV6EvaluationInference({ resolveInput, mode = "shadow" } = {}) {
  if (typeof resolveInput !== "function") {
    throw new Error("Production V6 evaluation inference requires resolveInput(sample)");
  }

  return async function inferProductionV6(sample) {
    const input = await resolveInput(sample);
    if (!input || typeof input !== "object") {
      throw new Error(`Production V6 evaluation input missing for ${sample?.image_id || "unknown image"}`);
    }

    const perceptionV6 = analyzePerceptionV6({
      perceptionV5: input.perceptionV5,
      regions: input.regions || [],
      decodedImage: input.decodedImage || null,
      mode: input.mode || mode,
    });

    return adaptPerceptionV6ForEvaluation(perceptionV6);
  };
}
