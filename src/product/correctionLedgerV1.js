const ALLOWED_FIELDS = new Set(["identity", "piece_ownership", "primary_color", "secondary_colors", "pattern"]);

function cleanText(value, maximum = 500) {
  return String(value ?? "").trim().slice(0, maximum);
}

function clone(value) {
  return value === undefined ? null : JSON.parse(JSON.stringify(value));
}

export function createCorrectionRecordV1({
  analysisId,
  zone,
  field,
  originalValue,
  correctedValue,
  reason = null,
  source = "user",
  createdAt = new Date().toISOString(),
} = {}) {
  const normalizedAnalysisId = cleanText(analysisId, 160);
  const normalizedZone = cleanText(zone, 80);
  const normalizedField = cleanText(field, 80);
  if (!normalizedAnalysisId) throw new Error("Correction requires analysisId");
  if (!normalizedZone) throw new Error("Correction requires zone");
  if (!ALLOWED_FIELDS.has(normalizedField)) throw new Error("Correction field is not allowed");
  if (correctedValue === undefined || correctedValue === null || correctedValue === "") throw new Error("Correction requires correctedValue");

  return {
    version: "correction_record_v1",
    analysis_id: normalizedAnalysisId,
    zone: normalizedZone,
    field: normalizedField,
    original_value: clone(originalValue),
    corrected_value: clone(correctedValue),
    reason: reason ? cleanText(reason) : null,
    source: ["user", "stylist", "annotator", "adjudicator"].includes(source) ? source : "user",
    created_at: new Date(createdAt).toISOString(),
    adjudication_status: "unreviewed",
    authority_effect: "none_until_adjudicated",
  };
}
export function buildCorrectionLedgerV1({ analysisId, originalResult = {}, corrections = [] } = {}) {
  const normalizedAnalysisId = cleanText(analysisId, 160);
  if (!normalizedAnalysisId) throw new Error("Correction ledger requires analysisId");
  const records = (Array.isArray(corrections) ? corrections : []).map((entry) => createCorrectionRecordV1({
    ...entry,
    analysisId: normalizedAnalysisId,
  }));
  return {
    version: "correction_ledger_v1",
    analysis_id: normalizedAnalysisId,
    original_result: clone(originalResult),
    corrections: records,
    correction_count: records.length,
    corrected_view: Object.fromEntries(records.map((record) => [`${record.zone}.${record.field}`, clone(record.corrected_value)])),
    policy: {
      original_result_is_immutable: true,
      correction_is_not_automatic_ground_truth: true,
      adjudication_required_before_training_or_benchmark_use: true,
      correction_cannot_silently_change_publication: true,
    },
  };
}

export function adjudicateCorrectionV1(record = {}, { accepted, adjudicatorId, notes = null, adjudicatedAt = new Date().toISOString() } = {}) {
  if (record?.version !== "correction_record_v1") throw new Error("A valid correction record is required");
  if (typeof accepted !== "boolean") throw new Error("Adjudication requires an accepted boolean");
  if (!cleanText(adjudicatorId, 160)) throw new Error("Adjudication requires adjudicatorId");
  return {
    ...clone(record),
    adjudication_status: accepted ? "accepted" : "rejected",
    adjudicator_id: cleanText(adjudicatorId, 160),
    adjudication_notes: notes ? cleanText(notes) : null,
    adjudicated_at: new Date(adjudicatedAt).toISOString(),
    authority_effect: accepted ? "eligible_for_evaluation_not_live_rewrite" : "none",
  };
}
