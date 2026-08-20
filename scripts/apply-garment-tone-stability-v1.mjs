import fs from "node:fs";

const path = "src/server.js";
let source = fs.readFileSync(path, "utf8");

const importNeedle = 'import { applyUpperGarmentPurityV1 } from "./intelligence/upperGarmentPurityV1.js";';
const importLine = 'import { applyGarmentToneStabilityV1 } from "./intelligence/garmentToneStabilityV1.js";';
if (!source.includes(importLine)) {
  if (!source.includes(importNeedle)) throw new Error("Tone stability import anchor not found");
  source = source.replace(importNeedle, `${importNeedle}\n${importLine}`);
}

const regionNeedle = `  const upperGarmentPurity = applyUpperGarmentPurityV1({\n    decodedImage,\n    regions: lowerGarmentPurity.regions,\n  });\n  const garmentEvidenceRegions = upperGarmentPurity.regions;`;
const regionReplacement = `  const upperGarmentPurity = applyUpperGarmentPurityV1({\n    decodedImage,\n    regions: lowerGarmentPurity.regions,\n  });\n  const garmentToneStability = applyGarmentToneStabilityV1({\n    decodedImage,\n    regions: upperGarmentPurity.regions,\n  });\n  const garmentEvidenceRegions = garmentToneStability.regions;`;
if (!source.includes("const garmentToneStability = applyGarmentToneStabilityV1")) {
  if (!source.includes(regionNeedle)) throw new Error("Tone stability handoff anchor not found");
  source = source.replace(regionNeedle, regionReplacement);
}

const responseNeedle = `    upper_garment_purity_v1: upperGarmentPurity.summary,\n    perception_v5: perceptionV5,`;
const responseReplacement = `    upper_garment_purity_v1: upperGarmentPurity.summary,\n    garment_tone_stability_v1: garmentToneStability.summary,\n    perception_v5: perceptionV5,`;
if (!source.includes("garment_tone_stability_v1: garmentToneStability.summary")) {
  if (!source.includes(responseNeedle)) throw new Error("Tone stability response anchor not found");
  source = source.replace(responseNeedle, responseReplacement);
}

fs.writeFileSync(path, source);
console.log("Garment Tone Stability V1 integration is present.");
