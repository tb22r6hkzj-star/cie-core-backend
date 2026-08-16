from pathlib import Path

path = Path('src/server.js')
text = path.read_text()

insert_before = '''function buildRawDinoColorClusters(regionColors = []) {'''
helpers = r'''
function normalizeConfidencePercent(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return 0;
  return n <= 1 ? clamp100(n * 100) : clamp100(n);
}

function calibrateConfidence(value, { evidenceWeight = 1, floor = 1, ceiling = 99 } = {}) {
  const normalized = normalizeConfidencePercent(value);
  const weighted = normalized * clamp01(Number(evidenceWeight || 0));
  return Math.round(Math.max(floor, Math.min(ceiling, weighted)));
}

function displayPaletteEvidenceWeight(source) {
  if (source === "refined_crop") return 1;
  if (source === "candidate_region") return 0.95;
  if (source === "raw_dino") return 0.88;
  if (source === "detector") return 0.8;
  return 0.7;
}

function calibrateDisplayColorConfidence({
  zoneConfidence = 0,
  colorPct = 0,
  sourceConfidence = 0,
  evidenceWeight = 1,
} = {}) {
  const zone = normalizeConfidencePercent(zoneConfidence) / 100;
  const pct = clamp01(normalizeColorPct(colorPct));
  const source = normalizeConfidencePercent(sourceConfidence) / 100;
  const combined = (zone * 0.55 + pct * 0.30 + source * 0.15) * 100;
  return calibrateConfidence(combined, { evidenceWeight, floor: 1, ceiling: 99 });
}

function withDisplayColorConfidence(color, context = {}) {
  if (!color) return color;
  return {
    ...color,
    confidence: calibrateDisplayColorConfidence({
      zoneConfidence: context.zoneConfidence,
      colorPct: color?.pct,
      sourceConfidence: context.sourceConfidence,
      evidenceWeight: context.evidenceWeight,
    }),
  };
}

function buildContaminationEvidenceScore({ dominant = null, regionCoverage = 0, suppressionGates = {} } = {}) {
  const hex = safeHex(dominant?.base || dominant?.hex || "");
  const pct = clamp01(normalizeColorPct(dominant?.pct));
  const hue = hex ? getHue(hex) : 0;
  const sat = hex ? getSat(hex) : 0;
  const light = hex ? getLight(hex) : 0;
  const skinLike = hex && !isBrownFamilyHex(hex) && hue >= 8 && hue <= 55 && sat >= 0.12 && sat <= 0.55 && light >= 0.42 && light <= 0.88 ? 1 : 0;
  const highlightLike = hex && light >= 0.82 && sat <= 0.22 ? 1 : 0;
  const neutralWeak = suppressionGates?.isNeutralContamination ? 1 : 0;
  const lowSignal = suppressionGates?.lowSignalRegion ? 1 : 0;
  const weakDominant = suppressionGates?.isWeakDominantEvidence ? 1 : 0;
  const legacySkinGate = suppressionGates?.jewelrySkinContamination ? 1 : 0;
  const lackOfCoverage = clamp01(1 - Number(regionCoverage || 0));
  const components = {
    skin_like: round2(skinLike * 0.34),
    highlight_like: round2(highlightLike * 0.24),
    neutral_weak: round2(neutralWeak * 0.12),
    low_signal: round2(lowSignal * 0.08),
    weak_dominant: round2(weakDominant * 0.08),
    legacy_skin_gate: round2(legacySkinGate * 0.08),
    low_coverage: round2(lackOfCoverage * (1 - pct) * 0.06),
  };
  const total = round2(Object.values(components).reduce((sum, value) => sum + Number(value || 0), 0));
  return { total, components };
}

function flattenRejectedDisplayAlternatives(trace = null) {
  return (trace?.sources || []).flatMap((sourceRow) =>
    (sourceRow?.rejected || []).map((candidate) => ({
      source: sourceRow.source,
      hex: candidate.hex || null,
      pct: candidate.pct ?? null,
      rejection_reason: candidate.reason || "not_selected",
    }))
  );
}

'''
if helpers.strip() not in text:
    if insert_before not in text:
        raise SystemExit('helper insertion anchor missing')
    text = text.replace(insert_before, helpers + insert_before, 1)

old_block = '''  const displayPalette = displayPaletteSelection?.palette || [];
  const accessoryDisplayRoles = displayPalette.length
    ? splitAccessoryDetectedPaletteRoles(displayPalette)
    : null;
  debugContext.dominantColor = { hex: dominantColor?.hex || null };
'''
new_block = '''  const displayPalette = displayPaletteSelection?.palette || [];
  const selectedDisplaySource = displayPaletteSelection?.selected_source || debugContext.zone_color_source || "fallback";
  const displayEvidenceWeight = displayPaletteEvidenceWeight(selectedDisplaySource);
  const explainabilitySourceConfidence = Number(contextEvidence?.weighted_confidence || sourceConfidence || zoneConfidence || 0);
  const calibratedDisplayPalette = displayPalette.map((color) => withDisplayColorConfidence(color, {
    zoneConfidence,
    sourceConfidence: explainabilitySourceConfidence,
    evidenceWeight: displayEvidenceWeight,
  }));
  const accessoryDisplayRoles = calibratedDisplayPalette.length
    ? splitAccessoryDetectedPaletteRoles(calibratedDisplayPalette)
    : null;
  const contaminationScore = buildContaminationEvidenceScore({
    dominant,
    regionCoverage: contextEvidence.coverage || regionCoverage,
    suppressionGates: debugContext.suppression_gates,
  });
  debugContext.contamination_score_total = contaminationScore.total;
  debugContext.contamination_score = contaminationScore;
  const rejectedAlternatives = flattenRejectedDisplayAlternatives(displayPaletteSelection?.trace);
  const explainabilityPublishedColors = calibratedDisplayPalette.length
    ? calibratedDisplayPalette
    : summaryColorReadClusters.map((color) => withDisplayColorConfidence(color, {
        zoneConfidence,
        sourceConfidence: explainabilitySourceConfidence,
        evidenceWeight: displayEvidenceWeight,
      }));
  const explainabilityPrimary = accessoryDisplayRoles?.primary || withDisplayColorConfidence(primaryColorRead, {
    zoneConfidence,
    sourceConfidence: explainabilitySourceConfidence,
    evidenceWeight: displayEvidenceWeight,
  });
  const publicationPrimaryReason = {
    code: calibratedDisplayPalette.length ? "highest_priority_surviving_palette" : "zone_color_read_selected",
    source: selectedDisplaySource,
    selected_hex: explainabilityPrimary?.hex || dominantColor?.hex || null,
    confidence: explainabilityPrimary?.confidence ?? calibrateConfidence(zoneConfidence),
    message: calibratedDisplayPalette.length
      ? "Published the highest-priority surviving color evidence after contamination filtering."
      : "Published the finalized zone color read supported by available evidence.",
  };
  const publicationReasons = {
    primary: publicationPrimaryReason,
    supporting: [
      {
        code: "confidence_calibrated",
        zone_weight: 0.55,
        color_percentage_weight: 0.30,
        source_confidence_weight: 0.15,
        evidence_weight: round2(displayEvidenceWeight),
      },
      {
        code: "contamination_evidence_scored",
        total: contaminationScore.total,
      },
    ],
  };
  const evidenceLedger = {
    zone: zoneKey,
    source: selectedDisplaySource,
    selected_color: explainabilityPrimary,
    published_colors: explainabilityPublishedColors,
    detector_evidence: rawDetectorPalette,
    dino_evidence: rawDinoPalette,
    crop_pixel_evidence: filterAccessoryDisplayPalette(pixelRefinedPalette).kept,
    candidate_region_evidence: candidateRegionPalette,
    contamination_scores: contaminationScore,
  };
  debugContext.dominantColor = { hex: dominantColor?.hex || null };
'''
if old_block not in text:
    raise SystemExit('display explainability anchor missing')
text = text.replace(old_block, new_block, 1)

text = text.replace('''    primary_color: accessoryDisplayRoles?.primary || primaryColorRead,
''','''    primary_color: explainabilityPrimary,
''',1)
text = text.replace('''    detected_colors: displayPalette.length ? displayPalette : summaryColorReadClusters,
    region_colors: displayPalette.length ? displayPalette : summaryColorReadClusters,
''','''    detected_colors: explainabilityPublishedColors,
    region_colors: explainabilityPublishedColors,
''',1)
text = text.replace('''    display_palette: isAccessoryDisplayPaletteZone(zoneKey) ? displayPalette : undefined,
    display_palette_trace: isAccessoryDisplayPaletteZone(zoneKey) ? displayPaletteSelection?.trace : undefined,
''','''    display_palette: isAccessoryDisplayPaletteZone(zoneKey) ? calibratedDisplayPalette : undefined,
    display_palette_trace: isAccessoryDisplayPaletteZone(zoneKey) ? displayPaletteSelection?.trace : undefined,
    evidence_ledger: evidenceLedger,
    publication_reasons: publicationReasons,
    publication_reason: publicationReasons.primary,
    rejected_alternatives: rejectedAlternatives,
''',1)

path.write_text(text)
