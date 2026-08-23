import fs from "node:fs";

const path = "src/server.js";
let source = fs.readFileSync(path, "utf8");

function replaceOnce(before, after, label) {
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`Missing ${label} anchor`);
  if (source.indexOf(before, first + before.length) >= 0) {
    throw new Error(`Ambiguous ${label} anchor`);
  }
  source = source.replace(before, after);
}

replaceOnce(
  'import { buildSceneOwnershipV1 } from "./intelligence/sceneOwnershipV1.js";',
  'import {\n  buildSceneOwnershipV1,\n  selectOutfitReasoningPaletteV1,\n} from "./intelligence/sceneOwnershipV1.js";',
  "Scene Ownership import"
);

replaceOnce(
  `  const fallbackReasoningColors = buildPublishedGarmentColorAuthority(\n    authoritativeGarmentZones,\n    normalizedColors\n  );\n  const reasoningColors = sceneOwnership.outfit_palette.length >= 2\n    ? sceneOwnership.outfit_palette\n    : fallbackReasoningColors;`,
  `  // Measure twice. Publish once: whole-image colors can remain diagnostic/contextual,\n  // but they cannot fill an outfit palette. Positive owned evidence wins even when\n  // exactly one garment color is available.\n  const fallbackReasoningColors = buildPublishedGarmentColorAuthority(\n    authoritativeGarmentZones,\n    []\n  );\n  const reasoningColors = selectOutfitReasoningPaletteV1(\n    sceneOwnership,\n    fallbackReasoningColors\n  );`,
  "reasoning palette handoff"
);

fs.writeFileSync(path, source);
