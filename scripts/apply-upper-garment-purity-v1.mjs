import fs from "node:fs";

const path = "src/server.js";
let source = fs.readFileSync(path, "utf8");

const importNeedle = 'import { applyLowerGarmentPurityV2 } from "./intelligence/lowerGarmentPurityV2.js";';
const importLine = 'import { applyUpperGarmentPurityV1 } from "./intelligence/upperGarmentPurityV1.js";';
if (!source.includes(importLine)) {
  if (!source.includes(importNeedle)) throw new Error("Upper garment purity import anchor not found");
  source = source.replace(importNeedle, `${importNeedle}\n${importLine}`);
}

const regionNeedle = `  const lowerGarmentPurity = applyLowerGarmentPurityV2({\n    decodedImage,\n    regions: pieceColorOwnership.regions,\n  });\n  const garmentEvidenceRegions = lowerGarmentPurity.regions;`;
const regionReplacement = `  const lowerGarmentPurity = applyLowerGarmentPurityV2({\n    decodedImage,\n    regions: pieceColorOwnership.regions,\n  });\n  const upperGarmentPurity = applyUpperGarmentPurityV1({\n    decodedImage,\n    regions: lowerGarmentPurity.regions,\n  });\n  const garmentEvidenceRegions = upperGarmentPurity.regions;`;
if (!source.includes("const upperGarmentPurity = applyUpperGarmentPurityV1")) {
  if (!source.includes(regionNeedle)) throw new Error("Upper garment purity handoff anchor not found");
  source = source.replace(regionNeedle, regionReplacement);
}

const responseNeedle = `    lower_garment_purity_v2: lowerGarmentPurity.summary,\n    perception_v5: perceptionV5,`;
const responseReplacement = `    lower_garment_purity_v2: lowerGarmentPurity.summary,\n    upper_garment_purity_v1: upperGarmentPurity.summary,\n    perception_v5: perceptionV5,`;
if (!source.includes("upper_garment_purity_v1: upperGarmentPurity.summary")) {
  if (!source.includes(responseNeedle)) throw new Error("Upper garment purity response anchor not found");
  source = source.replace(responseNeedle, responseReplacement);
}

fs.writeFileSync(path, source);
console.log("Upper Garment Region Purity V1 integration is present.");
