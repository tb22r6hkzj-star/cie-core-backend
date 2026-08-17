const clamp = (n) => Math.min(1, Math.max(0, Number(n) || 0));
const normalizeConfidence = (n) => {
  const value = Number(n);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return clamp(value > 1 ? value / 100 : value);
};

const validImage = (image) => {
  const width = Number(image?.width), height = Number(image?.height);
  const data = image?.data;
  const channels = Number(image?.channels) || (data?.length === width * height * 3 ? 3 : 4);
  return Number.isInteger(width) && width > 0 && Number.isInteger(height) && height > 0 &&
    data != null && typeof data.length === "number" && (channels === 3 || channels === 4) && data.length >= width * height * channels
    ? { width, height, data, channels }
    : null;
};

const rgbHex = ([r, g, b]) => `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
const distance = (a, b) => Math.sqrt(a.reduce((sum, value, i) => sum + (value - b[i]) ** 2, 0)) / 441.67;
const pixelKind = ([r, g, b]) => {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), light = (max + min) / 510;
  if (light > .88 && max - min < 35) return "highlight";
  if (r > 55 && r > b * 1.12 && r >= g * .9 && r - b > 18) return "skin";
  if (light < .18) return "dark";
  return "object";
};

function inspectPixels(region, decodedImage) {
  const image = validImage(decodedImage);
  const box = region?.normalized_box;
  if (!image || !box) return { available: false, valid: !!image, reason: image ? "missing_crop_geometry" : "invalid_or_missing_decoded_image", crop: box };
  const x1 = Math.max(0, Math.floor(box.x * image.width)), y1 = Math.max(0, Math.floor(box.y * image.height));
  const x2 = Math.min(image.width, Math.max(x1 + 1, Math.ceil(box.x2 * image.width)));
  const y2 = Math.min(image.height, Math.max(y1 + 1, Math.ceil(box.y2 * image.height)));
  const samples = [], surrounding = [], stride = Math.max(1, Math.floor(Math.sqrt(((x2 - x1) * (y2 - y1)) / 900)));
  const take = (x, y, target) => { const i = (y * image.width + x) * image.channels; if (image.channels !== 4 || image.data[i + 3] > 15) target.push([image.data[i], image.data[i + 1], image.data[i + 2]]); };
  for (let y = y1; y < y2; y += stride) for (let x = x1; x < x2; x += stride) take(x, y, samples);
  const padX = Math.max(1, Math.round((x2 - x1) * .25)), padY = Math.max(1, Math.round((y2 - y1) * .25));
  for (let y = Math.max(0, y1 - padY); y < Math.min(image.height, y2 + padY); y += stride) for (let x = Math.max(0, x1 - padX); x < Math.min(image.width, x2 + padX); x += stride) if (x < x1 || x >= x2 || y < y1 || y >= y2) take(x, y, surrounding);
  if (!samples.length) return { available: false, valid: true, reason: "empty_crop", crop: { x: x1, y: y1, width: x2 - x1, height: y2 - y1 } };
  const counts = { skin: 0, highlight: 0, dark: 0, object: 0 }, buckets = new Map();
  for (const p of samples) {
    const kind = pixelKind(p);
    counts[kind] += 1;
    if (kind !== "object" && kind !== "dark") continue;
    const key = p.map(v => Math.round(v / 32) * 32).join(",");
    const item = buckets.get(key) || { sum: [0,0,0], count: 0 };
    p.forEach((v,i) => item.sum[i] += v); item.count++; buckets.set(key,item);
  }
  const mean = (values) => values.length ? values.reduce((a,p) => a.map((v,i) => v + p[i]), [0,0,0]).map(v => v / values.length) : null;
  const localColors = [...buckets.values()].sort((a,b) => b.count-a.count).slice(0,4).map(v => {
    const rgb = v.sum.map(n => n/v.count);
    return { hex: rgbHex(rgb), pct: v.count/samples.length, pixel_count: v.count, source_class: pixelKind(rgb) };
  });
  const ratios = Object.fromEntries(Object.entries(counts).map(([k,v]) => [k, v/samples.length]));
  const contrast = surrounding.length ? distance(mean(samples), mean(surrounding)) : 0;
  const upperY2 = Math.min(y2, y1 + Math.max(1, Math.floor((y2 - y1) * .65)));
  let upperEdgeComparisons = 0, upperStrongEdges = 0;
  for (let y = y1; y < upperY2; y += stride) for (let x = x1; x + stride < x2; x += stride) {
    const i=(y*image.width+x)*image.channels, j=(y*image.width+x+stride)*image.channels;
    if (image.channels===4 && (image.data[i+3]<=15 || image.data[j+3]<=15)) continue;
    const a=[image.data[i],image.data[i+1],image.data[i+2]], b=[image.data[j],image.data[j+1],image.data[j+2]];
    if (pixelKind(a)==="skin" || pixelKind(b)==="skin") continue;
    upperEdgeComparisons += 1;
    if (distance(a,b) >= .055) upperStrongEdges += 1;
  }
  const spatial_structure={ upper_internal_edge_density: upperEdgeComparisons ? upperStrongEdges/upperEdgeComparisons : 0, upper_edge_comparisons: upperEdgeComparisons };
  return { available: true, valid: true, reason: "pixels_sampled", crop: { x: x1, y: y1, width: x2-x1, height: y2-y1 }, sample_count: samples.length, surrounding_sample_count: surrounding.length, ratios, contrast, spatial_structure, object_local_colors: localColors };
}

function evaluatePositiveObjectPresence(entry, pixels) {
  const label = `${entry.label} ${entry.zone}`.toLowerCase();
  const r = pixels.ratios || {};
  const evidence = [];
  const diagnosticEvidence = [];
  const objectShare = (r.object || 0) + (r.dark || 0);
  const edgeDensity = Number(pixels.spatial_structure?.upper_internal_edge_density || 0);
  const isHeadwear = /hat|cap|beanie|headwear/.test(label);

  if (pixels.contrast >= .055) evidence.push("boundary_separation");
  if ((r.object || 0) >= .22) evidence.push("object_pixel_mass");
  if ((r.dark || 0) >= .12 && pixels.contrast >= .075) evidence.push("structured_dark_mass");
  if ((pixels.object_local_colors || []).some((color) => Number(color.pct || 0) >= .12)) evidence.push("coherent_object_color");
  if (entry.confidence >= .62) diagnosticEvidence.push("detector_support");
  if (objectShare >= .38 && (r.skin || 0) < .50 && (r.highlight || 0) < .50) evidence.push("crop_occupancy");
  if (edgeDensity >= .08) evidence.push("upper_internal_edge_structure");

  if (!isHeadwear) {
    const requiredEvidence = 2;
    return {
      supported: evidence.length >= requiredEvidence,
      score: clamp(evidence.length / 4),
      evidence: [...evidence, ...diagnosticEvidence],
      qualifying_evidence: evidence,
      diagnostic_evidence: diagnosticEvidence,
      structural_evidence: evidence.filter((item) => ["upper_internal_edge_structure", "object_pixel_mass"].includes(item)),
      required_evidence: requiredEvidence,
      skin_dominant_head_crop: false,
    };
  }

  // Detector confidence may describe a candidate, but it cannot prove headwear.
  // A skin-dominant crop with limited dark material is characteristic of a
  // bare head/face crop and must be withheld even when DINO labels it as a hat.
  const skinDominantHeadCrop = (r.skin || 0) > .55 && (r.dark || 0) < .30;
  const structuralSignals = ["upper_internal_edge_structure", "object_pixel_mass"];
  const structuralEvidence = evidence.filter((item) => structuralSignals.includes(item));
  const requiredEvidence = 2;
  const supported = !skinDominantHeadCrop && evidence.length >= requiredEvidence && structuralEvidence.length > 0;

  return {
    supported,
    score: clamp(evidence.length / 4),
    evidence: [...evidence, ...diagnosticEvidence],
    qualifying_evidence: evidence,
    diagnostic_evidence: diagnosticEvidence,
    structural_evidence: structuralEvidence,
    required_evidence: requiredEvidence,
    skin_dominant_head_crop: skinDominantHeadCrop,
  };
}

function validateObject(entry, pixels) {
  if (!pixels.available) return { supported: null, accepted: entry.confidence >= .35, reason: "detector_only_no_pixels", contamination: [], positive_evidence: [] };
  const label = `${entry.label} ${entry.zone}`.toLowerCase(), r = pixels.ratios, contamination = [];
  if (r.highlight > .55) contamination.push("glare_or_highlight_dominance");
  if (/glass|eyewear|sunglass/.test(label)) {
    if (r.skin > .62) contamination.push("skin_dominance");
    if (r.dark > .7 && pixels.contrast < .055) contamination.push("unstructured_dark_patch");
    const supported = contamination.length === 0 && ((r.dark > .08 && pixels.contrast >= .055) || (r.object > .22 && pixels.contrast >= .04));
    return { supported, accepted: supported && entry.confidence >= .35, reason: supported ? "object_local_eyewear_structure" : contamination[0] || "insufficient_eyewear_pixel_contrast", contamination, positive_evidence: [] };
  }
  if (/hat|cap|beanie|headwear/.test(label)) {
    if (r.highlight > .55) contamination.push("glare_or_highlight_dominance");
    const presence = evaluatePositiveObjectPresence(entry, pixels);
    const supported = contamination.length === 0 && presence.supported;
    return {
      supported,
      accepted: supported && entry.confidence >= .85,
      reason: !supported
        ? contamination[0] || "insufficient_positive_headwear_evidence"
        : entry.confidence < .85
          ? "insufficient_headwear_detector_confidence"
          : "positive_headwear_object_presence",
      contamination,
      positive_evidence: presence.evidence,
      qualifying_evidence: presence.qualifying_evidence || [],
      diagnostic_evidence: presence.diagnostic_evidence || [],
      structural_evidence: presence.structural_evidence,
      object_presence_score: presence.score,
      required_positive_evidence: presence.required_evidence,
      skin_dominant_head_crop: !!presence.skin_dominant_head_crop,
    };
  }
  const supported = r.highlight < .72 && (pixels.contrast >= .025 || r.object + r.dark >= .25);
  return { supported, accepted: supported && entry.confidence >= .35, reason: supported ? "region_pixels_support_candidate" : "pixel_evidence_failed", contamination, positive_evidence: [] };
}

export function analyzePerceptionV6({ perceptionV5, regions = [], decodedImage = null, mode = "shadow" } = {}) {
  const v5 = perceptionV5 ?? { hypotheses: [], contradictions: [], arbitration: { outcome: "no_evidence" } };
  const evidenceLedger = regions.map((region, index) => {
    const best = v5.hypotheses?.find((h) => h.region_index === index && h.strategy === "original");
    const confidence = best?.score != null ? normalizeConfidence(best.score) : normalizeConfidence(region.confidence ?? region.score), geometry = v5.normalized_regions?.[index]?.normalized_box ?? null;
    const base = { id: region.id ?? `region-${index}`, source: region.source_type ?? "segmentation", zone: region.zone ?? "unknown", label: region.segment_label ?? region.label ?? region.category ?? "unknown", confidence, geometry };
    const pixelEvidence = inspectPixels({ ...region, normalized_box: geometry }, decodedImage), validation = validateObject(base, pixelEvidence);
    const supplied = (region.region_colors || []).map(c => c.hex).filter(Boolean);
    const survivingColors = pixelEvidence.available
      ? pixelEvidence.object_local_colors.filter(c => !["skin", "highlight"].includes(c.source_class))
      : supplied.map(hex => ({ hex, source: "detector" }));
    return { ...base, accepted: validation.accepted, detector_accepted: confidence >= .35, pixel_evidence: pixelEvidence, validation, object_local_colors: survivingColors };
  });
  const accepted = evidenceLedger.filter(e => e.accepted), grouped = new Map();
  for (const entry of accepted) { const key = `${entry.zone}:${entry.label}`, group = grouped.get(key) ?? { zone: entry.zone, label: entry.label, support: 0, evidence_ids: [], object_local_colors: [] }; group.support += entry.confidence; group.evidence_ids.push(entry.id); group.object_local_colors.push(...entry.object_local_colors); grouped.set(key, group); }
  const candidates = [...grouped.values()].sort((a,b) => b.support-a.support || `${a.zone}:${a.label}`.localeCompare(`${b.zone}:${b.label}`));
  const total = candidates.reduce((s,x)=>s+x.support,0), leader=candidates[0]??null;
  const consensus={ zone:leader?.zone??null,label:leader?.label??null,support:leader?.support??0,ratio:total?leader.support/total:0,evidence_ids:leader?.evidence_ids??[] };
  const byZone={}; for(const c of candidates) if(!byZone[c.zone]||c.support>byZone[c.zone].support) byZone[c.zone]=c;
  const objectPresence=Object.fromEntries(Object.entries(byZone).map(([z,x])=>[z,{present:true,label:x.label,confidence:clamp(x.support/x.evidence_ids.length),evidence_count:x.evidence_ids.length,object_local_colors:x.object_local_colors}]));
  for (const rejected of evidenceLedger.filter(e=>!e.accepted)) if (!objectPresence[rejected.zone]) objectPresence[rejected.zone]={present:false,label:rejected.label,confidence:rejected.confidence,evidence_count:1,reason:rejected.validation.reason};
  const reconciliation=Object.entries(byZone).map(([zone,s])=>({zone,selected_label:s.label,selected_evidence_ids:s.evidence_ids,object_local_colors:s.object_local_colors,alternatives:candidates.filter(x=>x.zone===zone&&x.label!==s.label).map(x=>x.label),resolution:"highest_pixel_validated_weighted_support",validation_decision:"accepted",publication_decision:"pending_global_gate"}));
  const contradictionPolicy={count:v5.contradictions?.length??0,action:v5.contradictions?.length?"penalize_and_require_consensus":"publish_normally",inherited_from_v5:true};
  const score=clamp((v5.arbitration?.confidence??0)*.65+consensus.ratio*.35), allowed=accepted.length>0&&v5.arbitration?.outcome==="accepted"&&score>=.55&&(contradictionPolicy.count===0||consensus.ratio>=.67);
  const reason=accepted.length===0?"no_accepted_evidence":v5.arbitration?.outcome!=="accepted"?"v5_not_accepted":score<.55?"insufficient_confidence":contradictionPolicy.count&&consensus.ratio<.67?"unresolved_contradiction":"evidence_threshold_met";
  for (const item of reconciliation) item.publication_decision = allowed ? "publish" : "blocked_by_global_gate";
  const publicationDecisions=evidenceLedger.map(e=>({id:e.id,zone:e.zone,label:e.label,published:e.accepted,reason:e.validation.reason,colors:e.object_local_colors,positive_evidence:e.validation.positive_evidence || [],structural_evidence:e.validation.structural_evidence || []}));
  return {version:"6",mode,decoded_image_valid:!!validImage(decodedImage),evidence_ledger:evidenceLedger,consensus,object_presence:objectPresence,zone_reconciliation:reconciliation,contradiction_policy:contradictionPolicy,publication_gating:{allowed,score,reason},publication_decisions:publicationDecisions,
    decision_trace:[{step:"ingest_v5",hypothesis_count:v5.hypotheses?.length??0,contradiction_count:contradictionPolicy.count},{step:"ledger",evidence_count:evidenceLedger.length,accepted_count:accepted.length},{step:"consensus",zone:consensus.zone,label:consensus.label,ratio:consensus.ratio},{step:"reconcile",zone_count:reconciliation.length},{step:"publication_gate",allowed,score,reason}],
    lifecycle_trace:[{stage:"candidate_selection",candidate_ids:evidenceLedger.map(e=>e.id)},{stage:"crop_selection",crops:evidenceLedger.map(e=>({id:e.id,crop:e.pixel_evidence.crop}))},{stage:"pixel_validation",results:evidenceLedger.map(e=>({id:e.id,supported:e.validation.supported,reason:e.validation.reason,positive_evidence:e.validation.positive_evidence || [],structural_evidence:e.validation.structural_evidence || []}))},{stage:"object_local_color_preservation",results:evidenceLedger.map(e=>({id:e.id,colors:e.object_local_colors}))},{stage:"publication",mode,decisions:publicationDecisions}]};
}
