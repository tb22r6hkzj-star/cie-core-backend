const clamp = (n) => Math.min(1, Math.max(0, Number(n) || 0));

function rgbToHsl(r, g, b) {
  const [rn, gn, bn] = [r, g, b].map((value) => value / 255);
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const lightness = (max + min) / 2;
  if (max === min) return { hue: 0, saturation: 0, lightness };
  const delta = max - min;
  const saturation = delta / (1 - Math.abs(2 * lightness - 1));
  const hue = max === rn
    ? 60 * (((gn - bn) / delta) % 6)
    : max === gn ? 60 * ((bn - rn) / delta + 2) : 60 * ((rn - gn) / delta + 4);
  return { hue: hue < 0 ? hue + 360 : hue, saturation, lightness };
}

function pixelClass(r, g, b, zone) {
  const { hue, saturation, lightness } = rgbToHsl(r, g, b);
  if (lightness >= .88 && saturation <= .18) return "highlight";
  // Skin is deliberately classified before the generic brown/object class. A
  // small amount of face visible through a glasses crop must never become an
  // accessory colour merely because it is below a crop-rejection threshold.
  if (hue >= 5 && hue <= 52 && saturation >= .18 && saturation <= .68 && lightness >= .38 && lightness <= .86) return "skin";
  if (/headwear|hat|cap|beanie/.test(zone) && hue <= 45 && saturation <= .45 && lightness < .28) return "hair";
  return "object";
}

function pixelBox(region, image) {
  const width = Number(image?.width), height = Number(image?.height);
  const bbox = region?.bbox || region?.box;
  if (!width || !height || !Array.isArray(bbox) || bbox.length < 4) return null;
  let [x, y, a, b] = bbox.map(Number);
  if (![x, y, a, b].every(Number.isFinite)) return null;
  if (Math.max(Math.abs(x), Math.abs(y), Math.abs(a), Math.abs(b)) <= 1) [x, y, a, b] = [x * width, y * height, a * width, b * height];
  // V5 treats detector boxes as x/y/width/height; retain that convention.
  const x1 = Math.max(0, Math.floor(x)), y1 = Math.max(0, Math.floor(y));
  const x2 = Math.min(width, Math.ceil(x + a)), y2 = Math.min(height, Math.ceil(y + b));
  return x2 > x1 && y2 > y1 ? { x1, y1, x2, y2 } : null;
}

function getObjectLocalColors(region, image) {
  const box = pixelBox(region, image), data = image?.data;
  if (!box || !data) return { available: false, colors: [], counts: {} };
  const counts = { object: 0, skin: 0, hair: 0, highlight: 0 };
  const buckets = new Map();
  const stride = Math.max(1, Math.floor(Math.sqrt(((box.x2 - box.x1) * (box.y2 - box.y1)) / 4000)));
  const zone = `${region?.zone || ""} ${region?.label || region?.segment_label || ""}`.toLowerCase();
  for (let y = box.y1; y < box.y2; y += stride) for (let x = box.x1; x < box.x2; x += stride) {
    const offset = (y * Number(image.width) + x) * 4;
    if (Number(data[offset + 3] ?? 255) < 20) continue;
    const r = Number(data[offset]), g = Number(data[offset + 1]), b = Number(data[offset + 2]);
    const sourceClass = pixelClass(r, g, b, zone);
    counts[sourceClass] += 1;
    if (sourceClass !== "object") continue;
    const key = `${Math.round(r / 16)}:${Math.round(g / 16)}:${Math.round(b / 16)}`;
    const bucket = buckets.get(key) || { count: 0, r: 0, g: 0, b: 0 };
    bucket.count += 1; bucket.r += r; bucket.g += g; bucket.b += b; buckets.set(key, bucket);
  }
  const objectCount = counts.object || 1;
  const colors = [...buckets.values()].map((bucket) => ({
    hex: `#${[bucket.r, bucket.g, bucket.b].map((sum) => Math.round(sum / bucket.count).toString(16).padStart(2, "0")).join("")}`,
    pct: bucket.count / objectCount,
    pixel_count: bucket.count,
    source_class: "object",
  })).sort((a, b) => b.pixel_count - a.pixel_count).slice(0, 6);
  return { available: true, colors, counts };
}

export function analyzePerceptionV6({ perceptionV5, regions = [], decodedImage = null } = {}) {
  const v5 = perceptionV5 ?? { hypotheses: [], contradictions: [], arbitration: { outcome: "no_evidence" } };
  const evidenceLedger = regions.map((region, index) => {
    const best = v5.hypotheses?.find((h) => h.region_index === index && h.strategy === "original");
    const confidence = clamp(best?.score ?? region.confidence ?? region.score);
    const local = getObjectLocalColors(region, decodedImage);
    const sampled = Object.values(local.counts).reduce((sum, value) => sum + value, 0);
    const objectRatio = sampled ? local.counts.object / sampled : 1;
    const pixelAccepted = !local.available || (local.counts.object >= 1 && objectRatio >= .08);
    const accepted = confidence >= .35 && pixelAccepted;
    return {
      id: region.id ?? `region-${index}`, source: region.source_type ?? "segmentation", zone: region.zone ?? "unknown",
      label: region.segment_label ?? region.label ?? region.category ?? "unknown", confidence,
      geometry: v5.normalized_regions?.[index]?.normalized_box ?? null, accepted,
      object_local_colors: local.colors,
      pixel_validation: { available: local.available, accepted: pixelAccepted, object_ratio: objectRatio, class_counts: local.counts },
      publication_decision: accepted ? "eligible" : "rejected",
    };
  });
  const accepted = evidenceLedger.filter((entry) => entry.accepted), grouped = new Map();
  for (const entry of accepted) {
    const key = `${entry.zone}:${entry.label}`, group = grouped.get(key) ?? { zone: entry.zone, label: entry.label, support: 0, evidence_ids: [], object_local_colors: [] };
    group.support += entry.confidence; group.evidence_ids.push(entry.id); group.object_local_colors.push(...entry.object_local_colors); grouped.set(key, group);
  }
  const candidates = [...grouped.values()].sort((a, b) => b.support - a.support || `${a.zone}:${a.label}`.localeCompare(`${b.zone}:${b.label}`));
  const total = candidates.reduce((sum, item) => sum + item.support, 0), leader = candidates[0] ?? null;
  const consensus = { zone: leader?.zone ?? null, label: leader?.label ?? null, support: leader?.support ?? 0, ratio: total ? leader.support / total : 0, evidence_ids: leader?.evidence_ids ?? [] };
  const byZone = {};
  for (const candidate of candidates) if (!byZone[candidate.zone] || candidate.support > byZone[candidate.zone].support) byZone[candidate.zone] = candidate;
  const objectPresence = Object.fromEntries(Object.entries(byZone).map(([zone, item]) => [zone, { present: item.support >= .35, label: item.label, confidence: clamp(item.support / item.evidence_ids.length), evidence_count: item.evidence_ids.length }]));
  const reconciliation = Object.entries(byZone).map(([zone, selected]) => ({ zone, selected_label: selected.label, selected_evidence_ids: selected.evidence_ids, object_local_colors: selected.object_local_colors, alternatives: candidates.filter((item) => item.zone === zone && item.label !== selected.label).map((item) => item.label), resolution: "highest_weighted_support", validation_decision: "accepted", publication_decision: "pending_global_gate" }));
  const contradictionPolicy = { count: v5.contradictions?.length ?? 0, action: v5.contradictions?.length ? "penalize_and_require_consensus" : "publish_normally", inherited_from_v5: true };
  const score = clamp((v5.arbitration?.confidence ?? 0) * .65 + consensus.ratio * .35);
  const allowed = accepted.length > 0 && v5.arbitration?.outcome === "accepted" && score >= .55 && (contradictionPolicy.count === 0 || consensus.ratio >= .67);
  const reason = accepted.length === 0 ? "no_accepted_evidence" : v5.arbitration?.outcome !== "accepted" ? "v5_not_accepted" : score < .55 ? "insufficient_confidence" : contradictionPolicy.count && consensus.ratio < .67 ? "unresolved_contradiction" : "evidence_threshold_met";
  const publicationGating = { allowed, score, reason };
  for (const item of reconciliation) item.publication_decision = allowed ? "publish" : "blocked_by_global_gate";
  return { version: "6", evidence_ledger: evidenceLedger, consensus, object_presence: objectPresence, zone_reconciliation: reconciliation, contradiction_policy: contradictionPolicy, publication_gating: publicationGating,
    decision_trace: [{ step: "ingest_v5", hypothesis_count: v5.hypotheses?.length ?? 0, contradiction_count: contradictionPolicy.count }, { step: "ledger", evidence_count: evidenceLedger.length, accepted_count: accepted.length }, { step: "consensus", zone: consensus.zone, label: consensus.label, ratio: consensus.ratio }, { step: "reconcile", zone_count: reconciliation.length }, { step: "publication_gate", ...publicationGating }] };
}
