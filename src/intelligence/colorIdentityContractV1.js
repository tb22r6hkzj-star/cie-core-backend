import chroma from "chroma-js";
import { getColorName } from "../engines/labelMapper/index.js";

function safeHex(value) {
  try { return chroma(value).hex().toUpperCase(); } catch { return null; }
}

function familyFromName(name = "") {
  const token = String(name).toLowerCase();
  if (/white|ivory|cream|linen/.test(token)) return "white";
  if (/black/.test(token)) return "black";
  if (/gray|grey|graphite|silver/.test(token)) return "gray";
  if (/brown|camel|cognac|tan|beige|sand|taupe/.test(token)) return "brown";
  if (/pink|rose|blush|magenta/.test(token)) return "pink";
  if (/red|crimson|burgundy|maroon/.test(token)) return "red";
  if (/orange|coral/.test(token)) return "orange";
  if (/yellow|gold/.test(token)) return "yellow";
  if (/green|olive/.test(token)) return "green";
  if (/blue|navy|cyan|teal/.test(token)) return "blue";
  if (/purple|violet|lavender/.test(token)) return "purple";
  return null;
}

export function buildCanonicalColorIdentityV1(value) {
  const hex = safeHex(typeof value === "string" ? value : value?.hex);
  if (!hex) return { valid: false, hex: null, name: null, family: null, reason: "invalid_hex" };
  const name = getColorName(hex);
  const family = familyFromName(name);
  return {
    valid: Boolean(family),
    hex,
    name,
    family,
    reason: family ? null : "name_family_unresolved",
    authority: "visioncore_hex_derived",
  };
}

export function canonicalizeColorObjectV1(color) {
  if (!color?.hex) return color;
  const canonical = buildCanonicalColorIdentityV1(color.hex);
  if (!canonical.valid) return { ...color, color_identity_contract_v1: canonical };
  const { translation: _staleTranslation, ...existingIdentity } = color?.color_identity || {};
  return {
    ...color,
    hex: canonical.hex,
    name: canonical.name,
    family: canonical.family,
    color_identity: {
      ...existingIdentity,
      name: canonical.name,
      family: canonical.family,
      hex: canonical.hex,
      authority: canonical.authority,
    },
    color_identity_contract_v1: canonical,
  };
}
