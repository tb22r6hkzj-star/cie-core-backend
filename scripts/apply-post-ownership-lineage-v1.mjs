import fs from "node:fs";

const path = new URL("../src/server.js", import.meta.url);
const source = fs.readFileSync(path, "utf8");
const needle = "    piece_color_ownership_v1: pieceColorOwnership.summary,";
const replacement = `    piece_color_ownership_v1: {\n      ...pieceColorOwnership.summary,\n      accessory_color_authorities: (Array.isArray(pieceColorOwnership?.regions) ? pieceColorOwnership.regions : [])\n        .filter((region) => region?.color_debug?.piece_color_ownership_v1?.target_type === \"accessory\")\n        .map((region) => {\n          const ownership = region?.color_debug?.piece_color_ownership_v1 || {};\n          const applied = ownership?.applied === true;\n          return {\n            id: region?.id || region?.region_id || region?.detection_id || null,\n            region_id: region?.region_id || null,\n            detection_id: region?.detection_id || null,\n            zone: region?.zone || null,\n            label: region?.label || region?.segment_label || region?.object_type || region?.accessory_type || null,\n            type: region?.accessory_type || region?.object_type || region?.label || region?.segment_label || region?.zone || null,\n            confidence: Number(region?.confidence || 0),\n            applied,\n            reason: ownership?.reason || null,\n            dominant_hex: applied ? (region?.dominant_hex || null) : null,\n            region_colors: applied && Array.isArray(region?.region_colors)\n              ? region.region_colors.map((color) => ({\n                  hex: color?.hex || null,\n                  pct: Number(color?.pct || color?.percentage || 0),\n                  percentage: Number(color?.percentage || color?.pct || 0),\n                  pixel_count: Number(color?.pixel_count || color?.sample_count || 0),\n                  source: color?.source || color?.measurement_source || null,\n                  measurement_source: color?.measurement_source || color?.source || null,\n                  ownership_validated: color?.ownership_validated === true,\n                }))\n              : [],\n            doctrine: ownership?.doctrine || null,\n            color_authority_source: \"piece_color_ownership_v1\",\n          };\n        }),\n    },`;

if (!source.includes(needle)) {
  if (source.includes("accessory_color_authorities: (Array.isArray(pieceColorOwnership?.regions)")) {
    console.log("post-ownership lineage patch already applied");
    process.exit(0);
  }
  throw new Error("post-ownership lineage insertion point not found");
}

const next = source.replace(needle, replacement);
if (next === source) throw new Error("post-ownership lineage patch made no change");
fs.writeFileSync(path, next);
console.log("post-ownership lineage patch applied");
