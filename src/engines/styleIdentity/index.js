// src/engines/styleIdentity/index.js
// Production style identity engine for deriving human-readable style identity labels.

import { normalizeModeLabel } from "../labelMapper/index.js";
import { STYLE_ARCHETYPES } from "../ontology/vocabulary.js";

export const STYLE_IDENTITY_ENGINE = Object.freeze({
  name: "styleIdentity",
  version: "1.0.0",
});

export function deriveBaseArchetype(bestMode) {
  const mode = normalizeModeLabel(bestMode);

  return STYLE_ARCHETYPES[mode] || "Classic";
}

export function deriveModifier(scoreBreakdown = {}) {
  const harmony = Number(scoreBreakdown.harmony || 0);
  const applicability = Number(scoreBreakdown.applicability || 0);
  const versatility = Number(scoreBreakdown.versatility || 0);
  const boldness = Number(scoreBreakdown.boldness || 0);

  if (boldness >= 82) return "Bold";
  if (harmony >= 86 && boldness <= 45) return "Controlled";
  if (versatility >= 90) return "Modern";
  if (applicability >= 88) return "Refined";

  if (
    harmony >= 78 &&
    applicability >= 78 &&
    versatility >= 78 &&
    boldness >= 40 &&
    boldness <= 75
  ) {
    return "Balanced";
  }

  if (boldness <= 38) return "Soft";

  return "Modern";
}

export function deriveStyleIdentity(bestMode, scoreBreakdown = {}) {
  const mode = normalizeModeLabel(bestMode);
  const modifier = deriveModifier(scoreBreakdown);
  const baseArchetype = deriveBaseArchetype(mode);

  return {
    mode,
    modifier,
    base_archetype: baseArchetype,
    label: `${modifier} ${baseArchetype}`,
  };
}

const styleIdentity = Object.freeze({
  STYLE_IDENTITY_ENGINE,
  deriveBaseArchetype,
  deriveModifier,
  deriveStyleIdentity,
});

export default styleIdentity;
