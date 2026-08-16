from pathlib import Path

path = Path('src/server.js')
text = path.read_text()

helper_anchor = 'function inferGarmentZones('
if 'const V6_DECISION_CONFIDENCE_CONFIG' not in text:
    idx = text.find(helper_anchor)
    if idx < 0:
        raise SystemExit('inferGarmentZones anchor missing')
    helpers = r'''
const V6_DECISION_CONFIDENCE_CONFIG = Object.freeze({
  object_evidence: 0.20,
  pixel_evidence: 0.16,
  geometry: 0.10,
  region: 0.14,
  coverage: 0.10,
  color_consistency: 0.12,
  publication: 0.18,
  skin_like_penalty: 0.08,
  highlight_penalty: 0.06,
  neutral_evidence: 0.50,
});

function normalizeDecisionConfidence(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return Math.max(0, Math.min(1, fallback));
  return Math.max(0, Math.min(1, n > 1 ? n / 100 : n));
}

function getZoneDecisionInputs(zone = {}) {
  const evidence = zone?.evidence_ledger || {};
  const contamination = evidence?.contamination_scores || {};
  const publishedColors = Array.isArray(evidence?.published_colors) ? evidence.published_colors : [];
  const regionColors = Array.isArray(zone?.region_colors) ? zone.region_colors : [];
  const detectorEvidence = Array.isArray(evidence?.detector_evidence) ? evidence.detector_evidence : [];
  const cropEvidence = Array.isArray(evidence?.crop_pixel_evidence) ? evidence.crop_pixel_evidence : [];
  const candidateEvidence = Array.isArray(evidence?.candidate_region_evidence) ? evidence.candidate_region_evidence : [];
  const pctTotal = (publishedColors.length ? publishedColors : regionColors)
    .reduce((sum, color) => sum + Math.max(0, Number(color?.pct || 0)), 0);
  const colorConfidenceValues = (publishedColors.length ? publishedColors : regionColors)
    .map((color) => normalizeDecisionConfidence(color?.confidence, 0))
    .filter((value) => Number.isFinite(value));
  const avgColorConfidence = colorConfidenceValues.length
    ? colorConfidenceValues.reduce((sum, value) => sum + value, 0) / colorConfidenceValues.length
    : normalizeDecisionConfidence(zone?.confidence, V6_DECISION_CONFIDENCE_CONFIG.neutral_evidence);
  const objectEvidence = normalizeDecisionConfidence(
    Math.max(Number(zone?.score || 0), Number(zone?.confidence || 0)),
    V6_DECISION_CONFIDENCE_CONFIG.neutral_evidence
  );
  const pixelEvidence = cropEvidence.length
    ? Math.min(1, 0.55 + cropEvidence.length * 0.10)
    : candidateEvidence.length
      ? 0.58
      : 0.42;
  const geometry = zone?.mask_geometry || zone?.bbox ? 0.72 : 0.5;
  const region = candidateEvidence.length || regionColors.length ? Math.min(1, 0.55 + Math.max(candidateEvidence.length, regionColors.length) * 0.07) : 0.4;
  const coverage = Math.max(0, Math.min(1, Number(zone?.coverage || zone?.pct || pctTotal || 0)));
  const colorConsistency = Math.max(0, Math.min(1, avgColorConfidence));
  const publication = zone?.primary_color?.hex || zone?.hex ? 0.85 : zone?.interpretation === 'unknown' ? 0.12 : 0.45;
  const skinPenalty = Math.max(0, Math.min(1, Number(contamination?.skin_or_beige || 0)));
  const highlightPenalty = Math.max(0, Math.min(1, Number(contamination?.highlight_or_glare || 0)));

  return {
    object_evidence: objectEvidence,
    pixel_evidence: pixelEvidence,
    geometry,
    region,
    coverage,
    color_consistency: colorConsistency,
    publication,
    skin_like_penalty: skinPenalty,
    highlight_penalty: highlightPenalty,
  };
}

function computeUnifiedZoneConfidence(zone = {}) {
  const inputs = getZoneDecisionInputs(zone);
  const positive =
    inputs.object_evidence * V6_DECISION_CONFIDENCE_CONFIG.object_evidence +
    inputs.pixel_evidence * V6_DECISION_CONFIDENCE_CONFIG.pixel_evidence +
    inputs.geometry * V6_DECISION_CONFIDENCE_CONFIG.geometry +
    inputs.region * V6_DECISION_CONFIDENCE_CONFIG.region +
    inputs.coverage * V6_DECISION_CONFIDENCE_CONFIG.coverage +
    inputs.color_consistency * V6_DECISION_CONFIDENCE_CONFIG.color_consistency +
    inputs.publication * V6_DECISION_CONFIDENCE_CONFIG.publication;
  const penalty =
    inputs.skin_like_penalty * V6_DECISION_CONFIDENCE_CONFIG.skin_like_penalty +
    inputs.highlight_penalty * V6_DECISION_CONFIDENCE_CONFIG.highlight_penalty;
  const raw = Math.max(0, Math.min(1, positive - penalty));
  const rawConfidence = Math.round(raw * 100);
  const legacyConfidence = Math.round(clamp100(Number(zone?.confidence || zone?.score || 0)));
  const calibratedConfidence = Math.round(clamp100(rawConfidence * 0.72 + legacyConfidence * 0.28));
  return {
    raw_confidence: rawConfidence,
    calibrated_confidence: calibratedConfidence,
    unified_confidence: calibratedConfidence,
    confidence_inputs: Object.fromEntries(Object.entries(inputs).map(([key, value]) => [key, round2(value)])),
    confidence_weights: { ...V6_DECISION_CONFIDENCE_CONFIG },
  };
}

function getV6PublicationState(zone = {}, unifiedConfidence = 0) {
  const hasPublishableEvidence = Boolean(zone?.primary_color?.hex || zone?.hex || zone?.dominant_color?.hex);
  if (!hasPublishableEvidence || zone?.interpretation === 'unknown' || zone?.publication_decision === 'reject') {
    return unifiedConfidence <= 20 ? 'rejected' : 'unknown';
  }
  if (unifiedConfidence >= 80) return 'confirmed';
  if (unifiedConfidence >= 65) return 'probable';
  if (unifiedConfidence >= 45) return 'possible';
  return 'unknown';
}

function buildV6EvidenceChain(zone = {}) {
  const evidence = zone?.evidence_ledger || {};
  return [
    { stage: 'detector', present: Array.isArray(evidence?.detector_evidence) && evidence.detector_evidence.length > 0, evidence: evidence?.detector_evidence || [] },
    { stage: 'region_selection', present: Array.isArray(evidence?.candidate_region_evidence) && evidence.candidate_region_evidence.length > 0, evidence: evidence?.candidate_region_evidence || [] },
    { stage: 'pixel_refinement', present: Array.isArray(evidence?.crop_pixel_evidence) && evidence.crop_pixel_evidence.length > 0, evidence: evidence?.crop_pixel_evidence || [] },
    { stage: 'geometry_validation', present: Boolean(zone?.mask_geometry || zone?.bbox), evidence: zone?.mask_geometry || zone?.bbox || null },
    { stage: 'contamination_analysis', present: Boolean(evidence?.contamination_scores), evidence: evidence?.contamination_scores || null },
    { stage: 'alternative_candidates', present: Array.isArray(zone?.rejected_alternatives) && zone.rejected_alternatives.length > 0, evidence: zone?.rejected_alternatives || [] },
    { stage: 'publication_decision', present: true, evidence: zone?.publication_reason || zone?.publication_reasons?.primary || null },
  ];
}

function buildV6DecisionMetrics(zone = {}, unifiedConfidence = 0, publicationState = 'unknown') {
  const alternatives = Array.isArray(zone?.rejected_alternatives) ? zone.rejected_alternatives : [];
  const palette = Array.isArray(zone?.display_palette) && zone.display_palette.length
    ? zone.display_palette
    : Array.isArray(zone?.region_colors) ? zone.region_colors : [];
  const confidences = palette.map((color) => Number(color?.confidence || 0)).filter(Number.isFinite).sort((a, b) => b - a);
  const top = confidences[0] || unifiedConfidence;
  const second = confidences[1] || 0;
  const pct = palette.map((color) => Number(color?.pct || 0)).filter(Number.isFinite).sort((a, b) => b - a);
  const dominantMargin = Math.max(0, (pct[0] || 0) - (pct[1] || 0));
  const certaintyMap = { confirmed: 1, probable: 0.8, possible: 0.6, unknown: 0.3, rejected: 0 };
  return {
    decision_complexity: 1 + alternatives.length + Math.max(0, palette.length - 1),
    candidate_count: Math.max(1, palette.length + alternatives.length),
    confidence_spread: Math.round(Math.max(0, top - second)),
    alternative_margin: Math.round(Math.max(0, unifiedConfidence - second)),
    dominant_margin: round2(dominantMargin),
    publication_certainty: certaintyMap[publicationState] ?? 0.3,
  };
}

function validateV6DecisionConsistency(zone = {}) {
  const issues = [];
  if (!Number.isFinite(Number(zone?.unified_confidence))) issues.push('unified_confidence_missing');
  if (!['confirmed', 'probable', 'possible', 'unknown', 'rejected'].includes(zone?.publication_state)) issues.push('invalid_publication_state');
  if (!Array.isArray(zone?.evidence_chain) || zone.evidence_chain.length !== 7) issues.push('evidence_chain_incomplete');
  if (zone?.publication_state === 'confirmed' && Number(zone?.unified_confidence || 0) < 80) issues.push('confirmed_below_threshold');
  if (zone?.publication_state === 'rejected' && (zone?.primary_color?.hex || zone?.hex)) issues.push('rejected_has_publishable_color');
  return { valid: issues.length === 0, issues };
}

function enrichV6FinalizedZone(zoneKey, zone = {}) {
  const confidence = computeUnifiedZoneConfidence(zone);
  const publicationState = getV6PublicationState(zone, confidence.unified_confidence);
  const evidenceChain = buildV6EvidenceChain(zone);
  const decisionMetrics = buildV6DecisionMetrics(zone, confidence.unified_confidence, publicationState);
  const calibrationMetadata = {
    predicted_confidence: confidence.raw_confidence,
    final_confidence: confidence.unified_confidence,
    supporting_evidence: evidenceChain.filter((entry) => entry.present).map((entry) => entry.stage),
    confidence_source: 'formula_v6_unified_confidence',
    calibration_ready: true,
  };
  const enriched = {
    ...zone,
    ...confidence,
    publication_state: publicationState,
    evidence_chain: evidenceChain,
    decision_metrics: decisionMetrics,
    calibration_metadata: calibrationMetadata,
  };
  return {
    ...enriched,
    decision_consistency: validateV6DecisionConsistency(enriched),
  };
}

'''
    text = text[:idx] + helpers + text[idx:]

old_final = '  const finalZones = garmentZoneFilterResult.zones;\n'
new_final = '''  const finalZones = Object.fromEntries(\n    Object.entries(garmentZoneFilterResult.zones).map(([zoneKey, zone]) => [\n      zoneKey,\n      enrichV6FinalizedZone(zoneKey, zone),\n    ])\n  );\n'''
if new_final not in text:
    if old_final not in text:
        raise SystemExit('finalZones anchor missing')
    text = text.replace(old_final, new_final, 1)

old_return = '''    confidence_breakdown: Object.fromEntries(\n      Object.entries(finalZones).map(([key, value]) => [key, value?.confidence_breakdown || null])\n    ),\n    region_color_analysis: regionColorAnalysis,\n'''
new_return = '''    confidence_breakdown: Object.fromEntries(\n      Object.entries(finalZones).map(([key, value]) => [key, value?.confidence_breakdown || null])\n    ),\n    decision_consistency: Object.fromEntries(\n      Object.entries(finalZones).map(([key, value]) => [key, value?.decision_consistency || { valid: false, issues: ["missing_decision_consistency"] }])\n    ),\n    decision_metrics: Object.fromEntries(\n      Object.entries(finalZones).map(([key, value]) => [key, value?.decision_metrics || null])\n    ),\n    confidence_calibration: Object.fromEntries(\n      Object.entries(finalZones).map(([key, value]) => [key, value?.calibration_metadata || null])\n    ),\n    region_color_analysis: regionColorAnalysis,\n'''
if new_return not in text:
    if old_return not in text:
        raise SystemExit('return aggregate anchor missing')
    text = text.replace(old_return, new_return, 1)

path.write_text(text)
