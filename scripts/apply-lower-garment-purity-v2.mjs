import fs from "node:fs";

const path = "src/server.js";
let source = fs.readFileSync(path, "utf8");

const importNeedle = 'import { applyPieceColorOwnershipV1 } from "./intelligence/pieceColorOwnershipV1.js";';
const importLine = 'import { applyLowerGarmentPurityV2 } from "./intelligence/lowerGarmentPurityV2.js";';
if (!source.includes(importLine)) {
  if (!source.includes(importNeedle)) throw new Error("Lower garment purity import anchor not found");
  source = source.replace(importNeedle, `${importNeedle}\n${importLine}`);
}

const regionNeedle = `  const pieceColorOwnership = applyPieceColorOwnershipV1({\n    decodedImage,\n    regions: rawGarmentEvidenceRegions,\n  });\n  const garmentEvidenceRegions = pieceColorOwnership.regions;`;
const regionReplacement = `  const pieceColorOwnership = applyPieceColorOwnershipV1({\n    decodedImage,\n    regions: rawGarmentEvidenceRegions,\n  });\n  const lowerGarmentPurity = applyLowerGarmentPurityV2({\n    decodedImage,\n    regions: pieceColorOwnership.regions,\n  });\n  const garmentEvidenceRegions = lowerGarmentPurity.regions;`;
if (!source.includes("const lowerGarmentPurity = applyLowerGarmentPurityV2")) {
  if (!source.includes(regionNeedle)) throw new Error("Lower garment purity handoff anchor not found");
  source = source.replace(regionNeedle, regionReplacement);
}

const responseNeedle = `    piece_color_ownership_v1: pieceColorOwnership.summary,\n    perception_v5: perceptionV5,`;
const responseReplacement = `    piece_color_ownership_v1: pieceColorOwnership.summary,\n    lower_garment_purity_v2: lowerGarmentPurity.summary,\n    perception_v5: perceptionV5,`;
if (!source.includes("lower_garment_purity_v2: lowerGarmentPurity.summary")) {
  if (!source.includes(responseNeedle)) throw new Error("Lower garment purity response anchor not found");
  source = source.replace(responseNeedle, responseReplacement);
}

fs.writeFileSync(path, source);
console.log("Lower Garment Region Purity V2 integration is present.");
