const clamp = (n) => Math.min(1, Math.max(0, Number(n) || 0));

export function normalizeBoundingBox(region = {}, image = {}) {
  const value = region.bounding_box ?? region.bbox ?? region.box ?? region.geometry;
  let x, y, width, height;
  if (Array.isArray(value)) {
    [x, y, width, height] = value.map(Number);
    if (region.bbox_format === "xyxy" || region.box_format === "xyxy") { width -= x; height -= y; }
  } else if (value && typeof value === "object") {
    x = Number(value.x ?? value.left ?? value.x1); y = Number(value.y ?? value.top ?? value.y1);
    width = Number(value.width ?? value.w ?? (Number(value.right ?? value.x2) - x));
    height = Number(value.height ?? value.h ?? (Number(value.bottom ?? value.y2) - y));
  } else return null;
  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return null;
  const iw = Number(image.width ?? region.image_width ?? region.imageWidth);
  const ih = Number(image.height ?? region.image_height ?? region.imageHeight);
  const unit = x >= 0 && y >= 0 && width <= 1 && height <= 1 && x + width <= 1.000001 && y + height <= 1.000001;
  if (!unit && (!(iw > 0) || !(ih > 0))) return null;
  const nx = clamp(unit ? x : x / iw), ny = clamp(unit ? y : y / ih);
  const x2 = clamp(unit ? x + width : (x + width) / iw), y2 = clamp(unit ? y + height : (y + height) / ih);
  return x2 > nx && y2 > ny ? { x: nx, y: ny, width: x2 - nx, height: y2 - ny, x2, y2, normalized: true } : null;
}

export function isRecoveryEligible(region = {}, box = normalizeBoundingBox(region)) {
  return Boolean(box) && clamp(region.confidence ?? region.score) >= 0.2 && box.width * box.height >= 0.0005 && region.recovery_disabled !== true;
}

function resize(box, scale) {
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  const x = clamp(cx - box.width * scale / 2), y = clamp(cy - box.height * scale / 2);
  const x2 = clamp(cx + box.width * scale / 2), y2 = clamp(cy + box.height * scale / 2);
  return { x, y, width: x2 - x, height: y2 - y, x2, y2, normalized: true };
}

export function generateCropHypotheses(region = {}, image = {}) {
  const box = normalizeBoundingBox(region, image); if (!box) return [];
  const variants = isRecoveryEligible(region, box) ? [["original", 1, 1], ["context", 1.18, .94], ["tight", .88, .86]] : [["original", 1, 1]];
  return variants.map(([strategy, scale, prior]) => ({ id: `${region.id ?? region.label ?? `region-${region._index ?? 0}`}:${strategy}`, region_id: region.id ?? null, region_index: region._index ?? null, strategy, box: resize(box, scale), prior }));
}

export function evaluateHypothesis(hypothesis, region = {}) {
  const confidence = clamp(region.confidence ?? region.score), coverage = clamp(region.coverage ?? hypothesis.box.width * hypothesis.box.height);
  const label = region.segment_label || region.label || region.category ? 1 : .35;
  const color = region.dominant_hex || region.region_colors?.length ? 1 : .45;
  const source = ["grounding_dino", "dino_detection"].includes(region.source_type) ? .95 : .85;
  const score = clamp(.5 * confidence + .15 * Math.sqrt(coverage) + .12 * label + .1 * color + .08 * source + .05 * hypothesis.prior);
  return { ...hypothesis, score, evidence: { confidence, coverage, label_strength: label, color_strength: color, source_strength: source } };
}

export function rankHypotheses(items = []) { return [...items].sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).map((item, i) => ({ ...item, rank: i + 1 })); }

function iou(a, b) {
  if (!a || !b) return 0;
  const intersection = Math.max(0, Math.min(a.x2, b.x2) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y2, b.y2) - Math.max(a.y, b.y));
  return intersection / (a.width * a.height + b.width * b.height - intersection || 1);
}

export function analyzePerceptionV5({ regions = [], image = {}, pipeline = null } = {}) {
  const normalized = regions.map((region, index) => ({ ...region, _index: index, normalized_box: normalizeBoundingBox(region, image) }));
  const hypotheses = rankHypotheses(normalized.flatMap((region) => generateCropHypotheses(region, image).map((h) => evaluateHypothesis(h, region))));
  const originals = hypotheses.filter((h) => h.strategy === "original"), contradictions = [];
  for (let a = 0; a < originals.length; a++) for (let b = a + 1; b < originals.length; b++) {
    const left = normalized[originals[a].region_index], right = normalized[originals[b].region_index];
    const overlap = iou(originals[a].box, originals[b].box);
    const labelConflict = (left?.segment_label ?? left?.label) !== (right?.segment_label ?? right?.label);
    const zoneConflict = left?.zone && right?.zone && left.zone !== right.zone;
    if (overlap >= .45 && (labelConflict || zoneConflict)) contradictions.push({ type: zoneConflict ? "zone_conflict" : "label_conflict", region_ids: [originals[a].region_id, originals[b].region_id], overlap, severity: clamp(overlap * Math.min(originals[a].score, originals[b].score)) });
  }
  const winner = originals[0] ?? hypotheses[0] ?? null, runnerUp = originals[1] ?? null;
  const margin = winner ? winner.score - (runnerUp?.score ?? 0) : 0;
  const relevant = winner ? contradictions.filter((c) => c.region_ids.includes(winner.region_id)) : [];
  const penalty = relevant.reduce((sum, c) => sum + c.severity * .25, 0), confidence = clamp((winner?.score ?? 0) - penalty);
  const arbitration = { selected_hypothesis_id: winner?.id ?? null, selected_region_id: winner?.region_id ?? null, confidence, outcome: !winner ? "no_evidence" : confidence >= .55 ? "accepted" : "review", contradiction_penalty: penalty };
  return { version: "5", recovery_eligible: normalized.filter((r) => isRecoveryEligible(r, r.normalized_box)).map((r) => r.id ?? r._index), normalized_regions: normalized.map(({ _index, ...r }) => r), hypotheses,
    stability: { stable: Boolean(winner) && margin >= .03 && relevant.length === 0, margin, competing_hypotheses: runnerUp ? 1 : 0 }, confidence_separation: { margin, winner: winner?.score ?? 0, runner_up: runnerUp?.score ?? 0 }, contradictions, arbitration,
    decision_trace: [{ step: "normalize", input_count: regions.length, valid_geometry_count: normalized.filter((r) => r.normalized_box).length }, { step: "hypothesize", hypothesis_count: hypotheses.length }, { step: "rank", winner: winner?.id ?? null, margin }, { step: "contradictions", count: contradictions.length, penalty }, { step: "arbitrate", ...arbitration }], pipeline_context: pipeline ?? null };
}
