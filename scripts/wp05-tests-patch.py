from pathlib import Path

path = Path('test/accessoryPalettePreservation.test.js')
text = path.read_text()
marker = 'WP-05 published accessory colors expose calibrated confidence and structured explanations'
if marker in text:
    raise SystemExit(0)

addition = r'''

test("WP-05 published accessory colors expose calibrated confidence and structured explanations", () => {
  const analysis = buildAnalysisWithDinoRegions([
    {
      id: "wp05_explainable_eyewear",
      source_type: "grounding_dino",
      zone: "eyewear",
      label: "eyewear",
      segment_label: "eyewear",
      dominant_hex: "#5A3522",
      confidence: 0.94,
      coverage: 0.08,
      region_colors: [
        { hex: "#5A3522", pct: 0.72, name: "Brown Frame" },
        { hex: "#3C2111", pct: 0.18, name: "Rich Brown" },
        { hex: "#D8A27E", pct: 0.07, name: "Skin" },
        { hex: "#FFFFFF", pct: 0.03, name: "Glare" },
      ],
    },
  ]);
  const zone = analysis.garment_zones.zones.eyewear;

  assert.ok(zone.primary_color.confidence >= 1 && zone.primary_color.confidence <= 100);
  assert.ok(zone.region_colors.every((color) => Number.isFinite(color.confidence) && color.confidence >= 1 && color.confidence <= 100));
  assert.equal(zone.evidence_ledger.zone, "eyewear");
  assert.equal(zone.evidence_ledger.selected_color.hex, zone.primary_color.hex);
  assert.deepEqual(zone.evidence_ledger.published_colors.map((c) => c.hex), zone.region_colors.map((c) => c.hex));
  assert.deepEqual(zone.publication_reason, zone.publication_reasons.primary);
  assert.equal(zone.publication_reason.selected_hex, zone.primary_color.hex);
  assert.ok(Number.isFinite(zone._debug.contamination_score_total));
  assert.ok(Number.isFinite(zone.evidence_ledger.contamination_scores.total));
});

test("WP-05 rejected accessory alternatives retain machine-readable rejection reasons", () => {
  const analysis = buildAnalysisWithDinoRegions([
    {
      id: "wp05_rejections",
      source_type: "grounding_dino",
      zone: "eyewear",
      label: "eyewear",
      segment_label: "eyewear",
      dominant_hex: "#6A4028",
      confidence: 0.95,
      coverage: 0.09,
      region_colors: [
        { hex: "#6A4028", pct: 0.64, name: "Brown Frame" },
        { hex: "#C9A47D", pct: 0.22, name: "Warm Beige" },
        { hex: "#F5F1ED", pct: 0.14, name: "Glare" },
      ],
    },
  ]);
  const zone = analysis.garment_zones.zones.eyewear;
  const reasons = zone.rejected_alternatives.map((candidate) => candidate.rejection_reason);

  assert.ok(zone.rejected_alternatives.length >= 1);
  assert.ok(reasons.every((reason) => typeof reason === "string" && reason.length > 0));
  assert.ok(reasons.includes("skin_or_beige_contamination") || reasons.includes("highlight_or_glare"));
  assert.ok(zone.evidence_ledger.detector_evidence.length > 0);
  assert.ok(zone.publication_reasons.supporting.some((reason) => reason.code === "confidence_calibrated"));
  assert.ok(zone.publication_reasons.supporting.some((reason) => reason.code === "contamination_evidence_scored"));
});
'''
path.write_text(text + addition)
