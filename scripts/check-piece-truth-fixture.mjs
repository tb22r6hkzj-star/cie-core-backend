import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { evaluatePieceTruthFixtureV1 } from "../src/evaluation/pieceTruthFixtureV1.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturePath = path.resolve(process.argv[2] || path.join(root, "evaluation/fixtures/dark-monogram-silver-jewelry-v1.json"));
const resultPath = process.argv[3] ? path.resolve(process.argv[3]) : null;
const imagePath = process.argv[4] ? path.resolve(process.argv[4]) : null;

if (!resultPath) {
  process.stderr.write("Usage: node scripts/check-piece-truth-fixture.mjs [fixture.json] <analysis-result.json> [source-image]\n");
  process.exit(64);
}

const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
if (imagePath) {
  const actual = crypto.createHash("sha256").update(fs.readFileSync(imagePath)).digest("hex");
  if (actual !== fixture?.source_asset?.sha256) {
    process.stderr.write(`${JSON.stringify({ passed: false, reason: "source_image_hash_mismatch", expected: fixture?.source_asset?.sha256, actual }, null, 2)}\n`);
    process.exit(2);
  }
}

const payload = JSON.parse(fs.readFileSync(resultPath, "utf8"));
const report = evaluatePieceTruthFixtureV1(fixture, payload);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
process.exitCode = report.passed ? 0 : 1;

