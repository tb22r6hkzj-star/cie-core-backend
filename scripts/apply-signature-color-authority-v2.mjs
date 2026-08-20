import fs from "node:fs";

const path = "src/server.js";
let source = fs.readFileSync(path, "utf8");

const importNeedle = 'import { buildPublishedGarmentZonesV2 } from "./intelligence/publishedGarmentZonesV2.js";';
const importLine = 'import { applySignatureColorAuthorityV2 } from "./intelligence/signatureColorAuthorityV2.js";';
if (!source.includes(importLine)) {
  if (!source.includes(importNeedle)) throw new Error("Signature authority import anchor not found");
  source = source.replace(importNeedle, `${importNeedle}\n${importLine}`);
}

const handoffNeedle = `  const colorEvidenceShadowZones = attachColorEvidenceToZones({\n    zones: garmentZones?.zones || {},\n    regions: garmentEvidenceRegions,\n    decodedImage,\n  });\n  const authoritativeGarmentZones = buildPublishedGarmentZonesV2(garmentZones, colorEvidenceShadowZones);`;
const handoffReplacement = `  const colorEvidenceShadowZones = attachColorEvidenceToZones({\n    zones: garmentZones?.zones || {},\n    regions: garmentEvidenceRegions,\n    decodedImage,\n  });\n  const signatureAuthorityZones = applySignatureColorAuthorityV2(colorEvidenceShadowZones);\n  const authoritativeGarmentZones = buildPublishedGarmentZonesV2(garmentZones, signatureAuthorityZones);`;
if (!source.includes("const signatureAuthorityZones = applySignatureColorAuthorityV2")) {
  if (!source.includes(handoffNeedle)) throw new Error("Signature authority handoff anchor not found");
  source = source.replace(handoffNeedle, handoffReplacement);
}

fs.writeFileSync(path, source);
console.log("Signature Color Authority V2 integration is present.");
