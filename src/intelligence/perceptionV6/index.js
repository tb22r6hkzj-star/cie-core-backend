const clamp = (n) => Math.min(1, Math.max(0, Number(n) || 0));

export function analyzePerceptionV6({ perceptionV5, regions = [] } = {}) {
  const v5 = perceptionV5 ?? { hypotheses: [], contradictions: [], arbitration: { outcome: "no_evidence" } };
  const evidenceLedger = regions.map((region, index) => {
    const best = v5.hypotheses?.find((h) => h.region_index === index && h.strategy === "original");
    const confidence = clamp(best?.score ?? region.confidence ?? region.score);
    return { id: region.id ?? `region-${index}`, source: region.source_type ?? "segmentation", zone: region.zone ?? "unknown", label: region.segment_label ?? region.label ?? region.category ?? "unknown", confidence, geometry: v5.normalized_regions?.[index]?.normalized_box ?? null, accepted: confidence >= .35 };
  });
  const accepted = evidenceLedger.filter((entry) => entry.accepted), grouped = new Map();
  for (const entry of accepted) {
    const key = `${entry.zone}:${entry.label}`, group = grouped.get(key) ?? { zone: entry.zone, label: entry.label, support: 0, evidence_ids: [] };
    group.support += entry.confidence; group.evidence_ids.push(entry.id); grouped.set(key, group);
  }
  const candidates = [...grouped.values()].sort((a, b) => b.support - a.support || `${a.zone}:${a.label}`.localeCompare(`${b.zone}:${b.label}`));
  const total = candidates.reduce((sum, item) => sum + item.support, 0), leader = candidates[0] ?? null;
  const consensus = { zone: leader?.zone ?? null, label: leader?.label ?? null, support: leader?.support ?? 0, ratio: total ? leader.support / total : 0, evidence_ids: leader?.evidence_ids ?? [] };
  const byZone = {};
  for (const candidate of candidates) if (!byZone[candidate.zone] || candidate.support > byZone[candidate.zone].support) byZone[candidate.zone] = candidate;
  const objectPresence = Object.fromEntries(Object.entries(byZone).map(([zone, item]) => [zone, { present: item.support >= .35, label: item.label, confidence: clamp(item.support / item.evidence_ids.length), evidence_count: item.evidence_ids.length }]));
  const reconciliation = Object.entries(byZone).map(([zone, selected]) => ({ zone, selected_label: selected.label, alternatives: candidates.filter((item) => item.zone === zone && item.label !== selected.label).map((item) => item.label), resolution: "highest_weighted_support" }));
  const contradictionPolicy = { count: v5.contradictions?.length ?? 0, action: v5.contradictions?.length ? "penalize_and_require_consensus" : "publish_normally", inherited_from_v5: true };
  const score = clamp((v5.arbitration?.confidence ?? 0) * .65 + consensus.ratio * .35);
  const allowed = accepted.length > 0 && v5.arbitration?.outcome === "accepted" && score >= .55 && (contradictionPolicy.count === 0 || consensus.ratio >= .67);
  const reason = accepted.length === 0 ? "no_accepted_evidence" : v5.arbitration?.outcome !== "accepted" ? "v5_not_accepted" : score < .55 ? "insufficient_confidence" : contradictionPolicy.count && consensus.ratio < .67 ? "unresolved_contradiction" : "evidence_threshold_met";
  const publicationGating = { allowed, score, reason };
  return { version: "6", evidence_ledger: evidenceLedger, consensus, object_presence: objectPresence, zone_reconciliation: reconciliation, contradiction_policy: contradictionPolicy, publication_gating: publicationGating,
    decision_trace: [{ step: "ingest_v5", hypothesis_count: v5.hypotheses?.length ?? 0, contradiction_count: contradictionPolicy.count }, { step: "ledger", evidence_count: evidenceLedger.length, accepted_count: accepted.length }, { step: "consensus", zone: consensus.zone, label: consensus.label, ratio: consensus.ratio }, { step: "reconcile", zone_count: reconciliation.length }, { step: "publication_gate", ...publicationGating }] };
}
