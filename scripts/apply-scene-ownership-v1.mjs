import fs from "node:fs";

const path = "src/server.js";
let source = fs.readFileSync(path, "utf8");

const importNeedle = 'import { applySignatureColorAuthorityV2 } from "./intelligence/signatureColorAuthorityV2.js";';
const importLine = 'import { buildSceneOwnershipV1 } from "./intelligence/sceneOwnershipV1.js";';
if (!source.includes(importLine)) {
  if (!source.includes(importNeedle)) throw new Error("Scene Ownership import anchor not found");
  source = source.replace(importNeedle, `${importNeedle}\n${importLine}`);
}

const reasoningNeedle = `  const garmentAnalysis = inferGarmentAndMaterial({\n  zones: authoritativeGarmentZones.zones,\n  normalizedColors,\n  colorEvidenceByZone,\n});\n\n  const reasoningColors = buildPublishedGarmentColorAuthority(authoritativeGarmentZones, normalizedColors);`;
const reasoningReplacement = `  const garmentAnalysis = inferGarmentAndMaterial({\n  zones: authoritativeGarmentZones.zones,\n  normalizedColors,\n  colorEvidenceByZone,\n});\n\n  const sceneOwnership = buildSceneOwnershipV1({\n    authoritativeGarmentZones,\n    garmentAnalysis,\n    normalizedColors,\n  });\n  const fallbackReasoningColors = buildPublishedGarmentColorAuthority(authoritativeGarmentZones, normalizedColors);\n  const reasoningColors = sceneOwnership.outfit_palette.length >= 2\n    ? sceneOwnership.outfit_palette\n    : fallbackReasoningColors;`;
if (!source.includes("const sceneOwnership = buildSceneOwnershipV1")) {
  if (!source.includes(reasoningNeedle)) throw new Error("Scene Ownership reasoning anchor not found");
  source = source.replace(reasoningNeedle, reasoningReplacement);
}

const authorityNeedle = `    color_authority: {\n      source: reasoningColors === normalizedColors ? "global_palette_fallback" : "published_garment_primaries",`;
const authorityReplacement = `    color_authority: {\n      source: reasoningColors === sceneOwnership.outfit_palette ? "scene_ownership_v1_outfit" : (reasoningColors === normalizedColors ? "global_palette_fallback" : "published_garment_primaries"),`;
if (!source.includes('source: reasoningColors === sceneOwnership.outfit_palette')) {
  if (!source.includes(authorityNeedle)) throw new Error("Scene Ownership authority anchor not found");
  source = source.replace(authorityNeedle, authorityReplacement);
}

const responseNeedle = `    garment_zones: authoritativeGarmentZones,\n    piece_color_ownership_v1: pieceColorOwnership.summary,`;
const responseReplacement = `    garment_zones: authoritativeGarmentZones,\n    scene_ownership_v1: sceneOwnership,\n    piece_color_ownership_v1: pieceColorOwnership.summary,`;
if (!source.includes("scene_ownership_v1: sceneOwnership")) {
  if (!source.includes(responseNeedle)) throw new Error("Scene Ownership response anchor not found");
  source = source.replace(responseNeedle, responseReplacement);
}

fs.writeFileSync(path, source);
console.log("Scene Ownership V1 integration is present.");
