import fs from "node:fs";
import { evaluateBenchmarkReadinessV1 } from "../src/evaluation/benchmarkReadinessV1.js";

const catalogUrl = new URL("../evaluation/golden-benchmark-v1.json", import.meta.url);
const catalog = JSON.parse(fs.readFileSync(catalogUrl, "utf8"));
const report = evaluateBenchmarkReadinessV1(catalog);

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
process.exitCode = report.ready ? 0 : 2;
