import fs from "node:fs";

const path = "src/server.js";
let source = fs.readFileSync(path, "utf8");

const importNeedle = 'import { attachColorEvidenceToZones } from "./intelligence/colorEvidence/index.js";';
const importReplacement = `${importNeedle}\nimport { applyPieceColorOwnershipV1 } from "./intelligence/pieceColorOwnershipV1.js";`;

if (!source.includes('import { applyPieceColorOwnershipV1 } from "./intelligence/pieceColorOwnershipV1.js";')) {
  if (!source.includes(importNeedle)) throw new Error("Piece ownership import anchor not found");
  source = source.replace(importNeedle, importReplacement);
}

const regionNeedle = `  const garmentEvidenceRegions = samRegions.length ? samRegions.concat(dedupedDinoRegions) : dinoRegions;\n  const garmentZoneSource = getGarmentZoneSource(samRegions, dedupedDinoRegions);`;
const regionReplacement = `  const rawGarmentEvidenceRegions = samRegions.length ? samRegions.concat(dedupedDinoRegions) : dinoRegions;\n  const pieceColorOwnership = applyPieceColorOwnershipV1({\n    decodedImage,\n    regions: rawGarmentEvidenceRegions,\n  });\n  const garmentEvidenceRegions = pieceColorOwnership.regions;\n  const garmentZoneSource = getGarmentZoneSource(samRegions, dedupedDinoRegions);`;

if (!source.includes("const pieceColorOwnership = applyPieceColorOwnershipV1")) {
  if (!source.includes(regionNeedle)) throw new Error("Garment evidence integration anchor not found");
  source = source.replace(regionNeedle, regionReplacement);
}

const responseNeedle = `    garment_zones: garmentZones,\n    perception_v5: perceptionV5,`;
const responseReplacement = `    garment_zones: garmentZones,\n    piece_color_ownership_v1: pieceColorOwnership.summary,\n    perception_v5: perceptionV5,`;

if (!source.includes("piece_color_ownership_v1: pieceColorOwnership.summary")) {
  if (!source.includes(responseNeedle)) throw new Error("Response integration anchor not found");
  source = source.replace(responseNeedle, responseReplacement);
}

fs.writeFileSync(path, source);
console.log("Piece-Level Color Ownership V1 integration is present.");
