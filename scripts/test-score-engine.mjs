import assert from "node:assert/strict";

import {
  scoreOutfit,
  computeOverallScore,
  computeModeScores,
  getBestMode,
} from "../src/engines/score/index.js";

const sampleScores = {
  harmony: 80,
  applicability: 78,
  versatility: 76,
  boldness: 55,
};

const expectedModes = ["Balance", "Contrast", "Cohesion", "Natural", "Explore"];

function scoreValue(entry) {
  if (Array.isArray(entry)) return Number(entry[1]);
  if (entry && typeof entry === "object") {
    return Number(entry.score ?? entry.value ?? entry.mode_score);
  }
  return Number(entry);
}

function modeName(entry) {
  if (Array.isArray(entry)) return entry[0];
  if (entry && typeof entry === "object") {
    return entry.mode ?? entry.name ?? entry.label;
  }
  return undefined;
}

function normalizeModeEntries(modeScores) {
  if (Array.isArray(modeScores)) {
    return modeScores.map((entry) => [modeName(entry), scoreValue(entry)]);
  }
  return Object.entries(modeScores).map(([mode, score]) => [mode, scoreValue(score)]);
}

assert.equal(computeOverallScore(sampleScores), 74);

const outfitScore = scoreOutfit(sampleScores);
assert.equal(outfitScore.overallScore, 74);
assert.equal(outfitScore.bestMode, "Balance");
assert.equal(outfitScore.modeScores.Balance, 81.36);
assert.equal(outfitScore.scoreBreakdown.harmony, sampleScores.harmony);
assert.equal(outfitScore.scoreBreakdown.applicability, sampleScores.applicability);
assert.equal(outfitScore.scoreBreakdown.versatility, sampleScores.versatility);
assert.equal(outfitScore.scoreBreakdown.boldness, sampleScores.boldness);

const modeScores = computeModeScores(sampleScores);

if (Array.isArray(modeScores)) {
  const values = modeScores.map(scoreValue);
  const sortedValues = [...values].sort((a, b) => b - a);
  assert.deepEqual(values, sortedValues);
} else {
  for (const mode of expectedModes) {
    assert.ok(
      Object.hasOwn(modeScores, mode),
      `Expected mode_scores to include ${mode}`,
    );
  }
}

const modeEntries = normalizeModeEntries(modeScores);
const strongestMode = modeEntries.reduce(
  (best, [mode, score]) => (score > best.score ? { mode, score } : best),
  { mode: null, score: -Infinity },
).mode;

assert.equal(getBestMode(modeScores), strongestMode);
assert.equal(getBestMode(modeScores), "Balance");

console.log("SCORE ENGINE TESTS PASSED");
