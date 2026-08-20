import fs from "node:fs";

const path = "src/server.js";
let source = fs.readFileSync(path, "utf8");

const importNeedle = 'import { applyPieceColorOwnershipV1 } from "./intelligence/pieceColorOwnershipV1.js";';
const importLine = 'import { buildPublishedGarmentZonesV2 } from "./intelligence/publishedGarmentZonesV2.js";';
if (!source.includes(importLine)) {
  if (!source.includes(importNeedle)) throw new Error("Publication V2 import anchor not found");
  source = source.replace(importNeedle, `${importNeedle}\n${importLine}`);
}

const evidenceNeedle = `  const colorEvidenceByZone = Object.fromEntries(\n    Object.entries(colorEvidenceShadowZones || {}).map(([zone, value]) => [zone, value?.color_evidence_v1 || null])\n  );\n  const garmentAnalysis = inferGarmentAndMaterial({\n  zones: colorEvidenceShadowZones,\n  normalizedColors,\n  colorEvidenceByZone,\n});\n\n  const reasoningColors = buildPublishedGarmentColorAuthority(garmentZones, normalizedColors);`;
const evidenceReplacement = `  const authoritativeGarmentZones = buildPublishedGarmentZonesV2(garmentZones, colorEvidenceShadowZones);\n  const colorEvidenceByZone = Object.fromEntries(\n    Object.entries(authoritativeGarmentZones?.zones || {}).map(([zone, value]) => [zone, value?.color_evidence_v1 || null])\n  );\n  const garmentAnalysis = inferGarmentAndMaterial({\n  zones: authoritativeGarmentZones.zones,\n  normalizedColors,\n  colorEvidenceByZone,\n});\n\n  const reasoningColors = buildPublishedGarmentColorAuthority(authoritativeGarmentZones, normalizedColors);`;
if (!source.includes("const authoritativeGarmentZones = buildPublishedGarmentZonesV2")) {
  if (!source.includes(evidenceNeedle)) throw new Error("Publication V2 evidence handoff anchor not found");
  source = source.replace(evidenceNeedle, evidenceReplacement);
}

source = source.replace("    garment_zones: garmentZones,\n", "    garment_zones: authoritativeGarmentZones,\n");
source = source.replace("        Object.entries(garmentZones?.zones || {}).map(([k, v]) => [k, Number(v?.confidence || v?.score || 0)])\n", "        Object.entries(authoritativeGarmentZones?.zones || {}).map(([k, v]) => [k, Number(v?.confidence || v?.score || 0)])\n");
source = source.replace("    confidence_breakdown: garmentZones?.confidence_breakdown || {},\n", "    confidence_breakdown: authoritativeGarmentZones?.confidence_breakdown || {},\n");
source = source.replace("    segmented_regions: garmentZones.segmented_regions || garmentEvidenceRegions,\n", "    segmented_regions: authoritativeGarmentZones.segmented_regions || garmentEvidenceRegions,\n");
source = source.replace("    region_color_analysis: garmentZones.region_color_analysis || [],\n", "    region_color_analysis: authoritativeGarmentZones.region_color_analysis || [],\n");

fs.writeFileSync(path, source);
console.log("Publication Consistency V2 integration is present.");
