from pathlib import Path

p = Path('src/intelligence/perceptionV6/index.js')
text = p.read_text()

old_return = '''  const ratios = Object.fromEntries(Object.entries(counts).map(([k,v]) => [k, v/samples.length]));\n  const contrast = surrounding.length ? distance(mean(samples), mean(surrounding)) : 0;\n  return { available: true, valid: true, reason: "pixels_sampled", crop: { x: x1, y: y1, width: x2-x1, height: y2-y1 }, sample_count: samples.length, surrounding_sample_count: surrounding.length, ratios, contrast, object_local_colors: localColors };\n}\n'''
new_return = '''  const ratios = Object.fromEntries(Object.entries(counts).map(([k,v]) => [k, v/samples.length]));\n  const contrast = surrounding.length ? distance(mean(samples), mean(surrounding)) : 0;\n  const upperY2 = Math.min(y2, y1 + Math.max(1, Math.floor((y2 - y1) * .65)));\n  let upperEdgeComparisons = 0, upperStrongEdges = 0;\n  for (let y = y1; y < upperY2; y += stride) {\n    for (let x = x1; x + stride < x2; x += stride) {\n      const i = (y * image.width + x) * image.channels;\n      const j = (y * image.width + x + stride) * image.channels;\n      if (image.channels === 4 && (image.data[i + 3] <= 15 || image.data[j + 3] <= 15)) continue;\n      const a = [image.data[i], image.data[i + 1], image.data[i + 2]];\n      const b = [image.data[j], image.data[j + 1], image.data[j + 2]];\n      if (pixelKind(a) === "skin" || pixelKind(b) === "skin") continue;\n      upperEdgeComparisons += 1;\n      if (distance(a, b) >= .065) upperStrongEdges += 1;\n    }\n  }\n  const spatialStructure = {\n    upper_internal_edge_density: upperEdgeComparisons ? upperStrongEdges / upperEdgeComparisons : 0,\n    upper_edge_comparisons: upperEdgeComparisons,\n  };\n  return { available: true, valid: true, reason: "pixels_sampled", crop: { x: x1, y: y1, width: x2-x1, height: y2-y1 }, sample_count: samples.length, surrounding_sample_count: surrounding.length, ratios, contrast, spatial_structure: spatialStructure, object_local_colors: localColors };\n}\n'''
if old_return not in text:
    raise SystemExit('inspectPixels return anchor missing')
text = text.replace(old_return, new_return, 1)

old_eval = '''  if (objectShare >= .38 && (r.skin || 0) < .50 && (r.highlight || 0) < .50) evidence.push("crop_occupancy");\n\n  const requiredEvidence = /hat|cap|beanie|headwear/.test(label) ? 3 : 2;\n  return {\n    supported: evidence.length >= requiredEvidence,\n    score: clamp(evidence.length / Math.max(requiredEvidence + 1, 4)),\n    evidence,\n    required_evidence: requiredEvidence,\n  };\n}\n'''
new_eval = '''  if (objectShare >= .38 && (r.skin || 0) < .50 && (r.highlight || 0) < .50) evidence.push("crop_occupancy");\n  if (Number(pixels.spatial_structure?.upper_internal_edge_density || 0) >= .08) evidence.push("upper_internal_edge_structure");\n  if (Number(entry.strategy_agreement || 0) >= 2) evidence.push("multi_strategy_agreement");\n\n  const isHeadwear = /hat|cap|beanie|headwear/.test(label);\n  const requiredEvidence = isHeadwear ? 3 : 2;\n  const structuralEvidence = !isHeadwear || evidence.some((item) => ["upper_internal_edge_structure", "multi_strategy_agreement"].includes(item));\n  return {\n    supported: evidence.length >= requiredEvidence && structuralEvidence,\n    score: clamp(evidence.length / Math.max(requiredEvidence + 1, 4)),\n    evidence,\n    required_evidence: requiredEvidence,\n    structural_evidence: structuralEvidence,\n  };\n}\n'''
if old_eval not in text:
    raise SystemExit('positive presence anchor missing')
text = text.replace(old_eval, new_eval, 1)

old_base = '''    const best = v5.hypotheses?.find((h) => h.region_index === index && h.strategy === "original");\n    const confidence = clamp(best?.score ?? region.confidence ?? region.score), geometry = v5.normalized_regions?.[index]?.normalized_box ?? null;\n    const base = { id: region.id ?? `region-${index}`, source: region.source_type ?? "segmentation", zone: region.zone ?? "unknown", label: region.segment_label ?? region.label ?? region.category ?? "unknown", confidence, geometry };\n'''
new_base = '''    const regionHypotheses = (v5.hypotheses || []).filter((h) => h.region_index === index);\n    const best = regionHypotheses.find((h) => h.strategy === "original") ?? regionHypotheses[0];\n    const strategyAgreement = new Set(regionHypotheses.filter((h) => clamp(h.score) >= .35).map((h) => h.strategy || "unknown")).size;\n    const confidence = clamp(best?.score ?? region.confidence ?? region.score), geometry = v5.normalized_regions?.[index]?.normalized_box ?? null;\n    const base = { id: region.id ?? `region-${index}`, source: region.source_type ?? "segmentation", zone: region.zone ?? "unknown", label: region.segment_label ?? region.label ?? region.category ?? "unknown", confidence, geometry, strategy_agreement: strategyAgreement };\n'''
if old_base not in text:
    raise SystemExit('evidence base anchor missing')
text = text.replace(old_base, new_base, 1)

old_validation = '''      required_positive_evidence: presence.required_evidence,\n    };\n'''
new_validation = '''      required_positive_evidence: presence.required_evidence,\n      structural_evidence: presence.structural_evidence,\n    };\n'''
if old_validation not in text:
    raise SystemExit('validation return anchor missing')
text = text.replace(old_validation, new_validation, 1)

p.write_text(text)

p = Path('test/objectPresenceV1.test.js')
text = p.read_text()
text = text.replace('''function run(decodedImage, confidence=.88) {\n  const regions=[{ id:"headwear-1", zone:"accessory_jewelry", segment_label:"hat", confidence }];\n  const perceptionV5={\n    hypotheses:[{ region_index:0, strategy:"original", score:confidence }],\n''','''function run(decodedImage, confidence=.88, strategies=["original"]) {\n  const regions=[{ id:"headwear-1", zone:"accessory_jewelry", segment_label:"hat", confidence }];\n  const perceptionV5={\n    hypotheses:strategies.map((strategy)=>({ region_index:0, strategy, score:confidence })),\n''',1)
text = text.replace('''  const result=run(decoded,.91);\n''','''  const result=run(decoded,.91,["original","expanded"]);\n''',1)
text = text.replace('''  assert.ok(validation.positive_evidence.length>=3);\n''','''  assert.ok(validation.positive_evidence.length>=3);\n  assert.equal(validation.structural_evidence,true);\n''',1)
p.write_text(text)
