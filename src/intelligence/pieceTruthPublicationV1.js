function token(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function safeHex(value) {
  const match = String(value || "").trim().match(/^#?([0-9a-f]{6})$/i);
  return match ? `#${match[1].toUpperCase()}` : null;
}

function ratio(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Number(Math.max(0, Math.min(1, numeric > 1 ? numeric / 100 : numeric)).toFixed(4));
}

function firstRatio(...values) {
  for (const value of values) {
    const normalized = ratio(value);
    if (normalized !== null) return normalized;
  }
  return null;
}

function paletteFrom(piece = {}) {
  const sources = [
    piece?.object_local_colors,
    piece?.region_colors,
    piece?.detected_colors,
    piece?.secondary_colors,
  ];
  const primaryHex = safeHex(
    piece?.primary_color?.hex || piece?.dominant_color?.hex || piece?.hex || piece?.dominant_hex
  );
  const seen = new Set();
  const rows = [];

  for (const source of sources) {
    for (const row of Array.isArray(source) ? source : []) {
      const hex = safeHex(row?.hex);
      if (!hex || seen.has(hex)) continue;
      seen.add(hex);
      rows.push({
        hex,
        name: row?.name || row?.color_name || null,
        color_share: firstRatio(row?.pct, row?.percentage, row?.share),
        ownership_validated: row?.ownership_validated === true,
        pattern_repetition_supported: row?.pattern_repetition_supported === true,
      });
    }
  }

  if (primaryHex && !seen.has(primaryHex)) {
    rows.unshift({
      hex: primaryHex,
      name: piece?.primary_color?.name || piece?.name || null,
      color_share: firstRatio(piece?.primary_color?.pct, piece?.primary_color?.percentage),
      ownership_validated: piece?.primary_color?.ownership_validated === true,
      pattern_repetition_supported: piece?.primary_color?.pattern_repetition_supported === true,
    });
  }
  if (primaryHex) rows.sort((a, b) => (a.hex === primaryHex ? -1 : b.hex === primaryHex ? 1 : 0));
  return rows;
}

function pieceType(piece = {}, fallback = null) {
  return token(
    piece?.accessory_type || piece?.garment_type || piece?.object_type || piece?.display_zone_label
      || piece?.label || piece?.type || fallback
  ) || "unknown_piece";
}

function correctionState(analysis = {}, piece = {}, zoneKey = null) {
  const external = analysis?.external_intelligence || {};
  const pass = external?.runtime_second_pass_v1 || external?.second_pass || {};
  const expected = new Set([
    token(zoneKey),
    token(piece?.semantic_instance_key || piece?.instance_key),
    token(piece?.accessory_type || piece?.garment_type || piece?.object_type || piece?.type),
  ].filter(Boolean));
  const matching = (Array.isArray(pass?.results) ? pass.results : []).filter((entry) => {
    const planPiece = token(entry?.plan?.piece);
    const planInstance = token(entry?.plan?.instance_key);
    return expected.has(planPiece) || expected.has(planInstance)
      || [...expected].some((value) => planPiece.includes(value) || value.includes(planPiece));
  });
  const requested = matching.length > 0 || (!Array.isArray(pass?.results)
    && (pass?.required === true || pass?.requested === true || pass?.enabled === true));
  const completed = requested && (matching.length
    ? matching.every((entry) => !entry?.skipped && entry?.ok !== false
      && (!entry?.plan?.remeasure_visioncore || entry?.visioncore_remeasurement?.ok === true)
      && (!entry?.plan?.reassess_semantic || entry?.semantic_reassessment?.ok === true))
    : pass?.completed === true || pass?.executed === true || pass?.ok === true);
  const reason = requested ? (pass?.reason || pass?.skip_reason || null) : null;
  return {
    requested,
    completed,
    state: completed ? "completed" : requested ? "required_unresolved" : "not_required",
    reason,
  };
}

function evidenceKey(piece = {}, fallbackKey = null) {
  const explicit = piece?.semantic_instance_key || piece?.instance_key || null;
  if (explicit) return `instance:${token(explicit)}`;
  const region = piece?.source_region_id || piece?.region_id || piece?.detection_id || null;
  if (region) return `region:${token(region)}`;
  return `zone:${token(piece?.zone_key || fallbackKey || pieceType(piece))}`;
}

function canonicalPiece(piece = {}, zoneKey, analysis = {}) {
  const palette = paletteFrom(piece);
  const primary = palette[0] || null;
  const type = pieceType(piece, zoneKey);
  const instanceKey = piece?.semantic_instance_key || piece?.instance_key || piece?.instance_id || null;
  const confidence = firstRatio(
    piece?.unified_confidence,
    piece?.calibrated_confidence,
    piece?.confidence,
    piece?.score
  );
  const maskCoverage = firstRatio(
    piece?.mask_coverage,
    piece?.coverage,
    piece?.region_coverage,
    piece?.color_evidence_v1?.region_purity,
    piece?.color_evidence_v1?.scene_boundary_purity?.owned_ratio
  );
  const primaryShare = firstRatio(
    primary?.color_share,
    piece?.primary_color?.pct,
    piece?.primary_color?.percentage
  );
  const mode = palette.length === 0
    ? "unknown"
    : token(piece?.color_mode || piece?.interpretation || "") || (palette.length > 1 ? "multi_color" : "single_color");
  const publication = token(piece?.publication_state || piece?.publication_decision || piece?.color_publication_decision || "") || "unspecified";
  const idStem = token(instanceKey || zoneKey || type) || "piece";
  const pieceId = `piece_${idStem}`;

  return {
    piece_id: pieceId,
    zone_key: zoneKey || piece?.zone_key || null,
    instance_key: instanceKey,
    piece_type: type,
    display_name: piece?.display_name || piece?.garment_type || piece?.label || piece?.name || type,
    color_mode: mode,
    pattern: piece?.pattern || null,
    primary_color: primary,
    palette,
    material_family: piece?.material_family || piece?.metallic_color_evidence_v1?.material_identity || null,
    publication_state: publication,
    metrics_v1: {
      measurement_confidence: confidence,
      primary_color_share: primaryShare,
      mask_coverage: maskCoverage,
      units: "ratio_0_to_1",
      display_labels: {
        measurement_confidence: "Measurement confidence",
        primary_color_share: "Primary color share",
        mask_coverage: "Mask coverage",
      },
    },
    correction_v1: correctionState(analysis, piece, zoneKey),
    provenance_v1: {
      authority_owner: "visioncore",
      evidence_key: evidenceKey(piece, zoneKey),
      source_region_id: piece?.source_region_id || piece?.region_id || piece?.detection_id || null,
      color_authority_source: piece?.color_authority_source || piece?.primary_color?.measurement_source || null,
      exclusive_mask_ownership: piece?.primary_color?.exclusive_mask_ownership === true
        || piece?.color_debug?.piece_color_ownership_v1?.applied === true,
    },
  };
}

function quality(piece = {}) {
  const published = /publish|confirm/.test(String(piece?.publication_state || "")) ? 1 : 0;
  return published * 2 + Number(piece?.metrics_v1?.measurement_confidence || 0);
}

export function buildPieceTruthPublicationV1(analysis = {}) {
  const zones = analysis?.garment_zones?.zones || {};
  const instances = Array.isArray(analysis?.accessory_instances_v1?.instances)
    ? analysis.accessory_instances_v1.instances
    : [];
  const candidates = [
    ...Object.entries(zones).map(([zoneKey, zone]) => canonicalPiece(zone, zoneKey, analysis)),
    ...instances.map((instance, index) => canonicalPiece(
      instance,
      instance?.zone_key || `accessory_${pieceType(instance)}_${index + 1}`,
      analysis
    )),
  ];

  // Projections frequently contain the same physical piece more than once.
  // Consolidate only when they share explicit instance/region lineage or the
  // exact same zone key; spatially distinct items remain distinct pieces.
  const byEvidence = new Map();
  for (const piece of candidates) {
    const key = piece?.provenance_v1?.evidence_key || piece.piece_id;
    const existing = byEvidence.get(key);
    if (!existing || quality(piece) > quality(existing)) byEvidence.set(key, piece);
  }
  const lineageDeduped = [...byEvidence.values()];
  const pieces = [];
  for (const piece of lineageDeduped.sort((a, b) => quality(b) - quality(a))) {
    const sameType = pieces.find((existing) => existing.piece_type === piece.piece_type);
    const hasIndependentRegion = Boolean(piece?.provenance_v1?.source_region_id);
    const existingHasIndependentRegion = Boolean(sameType?.provenance_v1?.source_region_id);
    // Detector-generated instance IDs are not proof of separate physical
    // objects. Keep two same-type cards only when both own distinct measured
    // regions (for example left and right earrings). Otherwise they are
    // competing projections of one unresolved physical piece.
    if (sameType && (!hasIndependentRegion || !existingHasIndependentRegion)) continue;
    pieces.push(piece);
  }
  const byZone = Object.fromEntries(pieces.filter((piece) => piece.zone_key).map((piece) => [piece.zone_key, piece.piece_id]));

  return {
    version: "piece_truth_v1",
    authority_owner: "visioncore",
    pieces,
    by_zone: byZone,
    metric_contract_v1: {
      measurement_confidence: "model certainty; never a color proportion",
      primary_color_share: "share of owned mask pixels assigned to the primary color",
      mask_coverage: "share of the target region represented by validated mask pixels",
      units: "ratio_0_to_1",
    },
    projection_policy: "customer-facing cards reference canonical pieces; aliases do not own color truth",
    duplicate_policy: "consolidate shared instance or region lineage; preserve spatially distinct instances",
  };
}

function attachRefs(analysis, truth) {
  const refFor = (piece, fallback) => {
    const key = evidenceKey(piece, fallback);
    const canonical = truth.pieces.find((row) => row?.provenance_v1?.evidence_key === key);
    return canonical || null;
  };
  const zones = analysis?.garment_zones?.zones || {};
  const nextZones = Object.fromEntries(Object.entries(zones).map(([zoneKey, zone]) => {
    const canonical = refFor(zone, zoneKey);
    return [zoneKey, canonical ? {
      ...zone,
      piece_truth_ref: canonical.piece_id,
      metrics_v1: canonical.metrics_v1,
    } : zone];
  }));
  const bundle = analysis?.accessory_instances_v1;
  const instances = Array.isArray(bundle?.instances) ? bundle.instances.map((instance) => {
    const canonical = refFor(instance, instance?.zone_key);
    return canonical ? {
      ...instance,
      piece_truth_ref: canonical.piece_id,
      metrics_v1: canonical.metrics_v1,
    } : instance;
  }) : null;

  return {
    ...analysis,
    piece_truth_v1: truth,
    garment_zones: analysis?.garment_zones ? {
      ...analysis.garment_zones,
      zones: nextZones,
    } : analysis?.garment_zones,
    accessory_instances_v1: bundle && instances ? { ...bundle, instances } : bundle,
  };
}

export function applyPieceTruthPublicationV1(payload = {}) {
  if (!payload || typeof payload !== "object") return payload;
  if (payload?.outfit_analysis && typeof payload.outfit_analysis === "object") {
    const truth = buildPieceTruthPublicationV1(payload.outfit_analysis);
    return { ...payload, outfit_analysis: attachRefs(payload.outfit_analysis, truth) };
  }
  if (payload?.outfitAnalysis && typeof payload.outfitAnalysis === "object") {
    const truth = buildPieceTruthPublicationV1(payload.outfitAnalysis);
    return { ...payload, outfitAnalysis: attachRefs(payload.outfitAnalysis, truth) };
  }
  const truth = buildPieceTruthPublicationV1(payload);
  return attachRefs(payload, truth);
}
