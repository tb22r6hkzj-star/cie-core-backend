from pathlib import Path

p = Path('src/intelligence/perceptionV6/index.js')
s = p.read_text()
old = '''  if (Number(pixels.spatial_structure?.upper_internal_edge_density || 0) >= .08) evidence.push("upper_internal_edge_structure");
  const isHeadwear = /hat|cap|beanie|headwear/.test(label);
  const requiredEvidence = isHeadwear ? 3 : 2;
  const structuralSignals = ["upper_internal_edge_structure", "object_pixel_mass"];
  const structuralEvidence = evidence.filter((item) => structuralSignals.includes(item));
  const supported = evidence.length >= requiredEvidence && (!isHeadwear || structuralEvidence.length > 0);
'''
new = '''  if (Number(pixels.spatial_structure?.upper_internal_edge_density || 0) >= .08) evidence.push("upper_internal_edge_structure");
  const isHeadwear = /hat|cap|beanie|headwear/.test(label);
  const objectDominantCrop = objectShare >= .45 && (r.skin || 0) <= .28 && (r.highlight || 0) < .45;
  if (isHeadwear && objectDominantCrop) evidence.push("object_dominant_crop");
  const requiredEvidence = isHeadwear ? 3 : 2;
  const structuralSignals = ["upper_internal_edge_structure", "object_dominant_crop"];
  const structuralEvidence = evidence.filter((item) => structuralSignals.includes(item));
  const headwearBoundaryEvidence = evidence.includes("boundary_separation");
  const supported = evidence.length >= requiredEvidence && (!isHeadwear || (headwearBoundaryEvidence && structuralEvidence.length > 0));
'''
if old not in s:
    raise SystemExit('Headwear structural evidence block not found')
s = s.replace(old, new, 1)
p.write_text(s)
