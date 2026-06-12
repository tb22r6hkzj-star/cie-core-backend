// src/engines/score/index.js
// Production score engine for backend-safe outfit scoring modes.

const SCORE_MIN = 0;
const SCORE_MAX = 100;

function clampScore(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return SCORE_MIN;
  return Math.max(SCORE_MIN, Math.min(SCORE_MAX, numeric));
}

function roundScore(value) {
  return Math.round(clampScore(value));
}

function round2(value) {
  return Math.round(clampScore(value) * 100) / 100;
}

function normalizeScores(scores = {}) {
  return {
    harmony: clampScore(scores.harmony),
    applicability: clampScore(scores.applicability),
    versatility: clampScore(scores.versatility),
    boldness: clampScore(scores.boldness),
  };
}

function scoreNearTarget(value, target, spread = SCORE_MAX) {
  const distance = Math.abs(clampScore(value) - clampScore(target));
  const normalizedSpread = Math.max(1, Number(spread) || SCORE_MAX);
  return clampScore(SCORE_MAX - (distance / normalizedSpread) * SCORE_MAX);
}

export const MODE_RULES = Object.freeze({
  Balance: Object.freeze({
    label: "Balance",
    weights: Object.freeze({
      harmony: 0.3,
      applicability: 0.28,
      versatility: 0.27,
      boldness: 0.15,
    }),
    boldnessTarget: 55,
    boldnessSpread: 70,
  }),
  Contrast: Object.freeze({
    label: "Contrast",
    weights: Object.freeze({
      harmony: 0.22,
      applicability: 0.18,
      versatility: 0.2,
      boldness: 0.4,
    }),
  }),
  Cohesion: Object.freeze({
    label: "Cohesion",
    weights: Object.freeze({
      harmony: 0.45,
      applicability: 0.25,
      versatility: 0.2,
      boldness: 0.1,
    }),
    boldnessTarget: 38,
    boldnessSpread: 75,
  }),
  Natural: Object.freeze({
    label: "Natural",
    weights: Object.freeze({
      harmony: 0.28,
      applicability: 0.35,
      versatility: 0.25,
      boldness: 0.12,
    }),
    boldnessTarget: 42,
    boldnessSpread: 70,
  }),
  Explore: Object.freeze({
    label: "Explore",
    weights: Object.freeze({
      harmony: 0.18,
      applicability: 0.16,
      versatility: 0.26,
      boldness: 0.4,
    }),
  }),
});

export function computeOverallScore(scores = {}) {
  const normalized = normalizeScores(scores);
  return roundScore(
    normalized.harmony * 0.34 +
      normalized.applicability * 0.26 +
      normalized.versatility * 0.22 +
      normalized.boldness * 0.18
  );
}

export function computeModeScore(mode, scores = {}) {
  const rule = MODE_RULES[mode];
  if (!rule) return 0;

  const normalized = normalizeScores(scores);
  const boldnessScore = Number.isFinite(rule.boldnessTarget)
    ? scoreNearTarget(normalized.boldness, rule.boldnessTarget, rule.boldnessSpread)
    : normalized.boldness;

  const weightedScore =
    normalized.harmony * rule.weights.harmony +
    normalized.applicability * rule.weights.applicability +
    normalized.versatility * rule.weights.versatility +
    boldnessScore * rule.weights.boldness;

  return round2(weightedScore);
}

export function computeModeScores(scores = {}) {
  return Object.keys(MODE_RULES).reduce((acc, mode) => {
    acc[mode] = computeModeScore(mode, scores);
    return acc;
  }, {});
}

export function getBestMode(modeScores = {}) {
  const entries = Object.entries(modeScores);
  if (!entries.length) return null;

  return entries.reduce(
    (best, [mode, score]) => {
      const numericScore = clampScore(score);
      if (numericScore > best.score) return { mode, score: numericScore };
      return best;
    },
    { mode: entries[0][0], score: clampScore(entries[0][1]) }
  ).mode;
}

export function scoreOutfit(scores = {}) {
  const normalized = normalizeScores(scores);
  const overallScore = computeOverallScore(normalized);
  const modeScores = computeModeScores(normalized);
  const bestMode = getBestMode(modeScores);

  return {
    overallScore,
    bestMode,
    modeScores,
    scoreBreakdown: normalized,
  };
}

const scoreEngine = Object.freeze({
  MODE_RULES,
  computeOverallScore,
  computeModeScore,
  computeModeScores,
  getBestMode,
  scoreOutfit,
});

export default scoreEngine;
