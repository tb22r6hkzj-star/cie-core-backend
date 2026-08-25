import test from "node:test";
import assert from "node:assert/strict";
import { buildAnalysisCacheKeyV1, createMemoryWardrobeRepositoryV1 } from "../src/product/wardrobeArchiveV1.js";

test("analysis cache key changes with pipeline or semantic version", () => {
  const a = buildAnalysisCacheKeyV1({ imageHash: "abc", pipelineVersion: "v1", semanticModel: "off" });
  const b = buildAnalysisCacheKeyV1({ imageHash: "abc", pipelineVersion: "v2", semanticModel: "off" });
  assert.notEqual(a, b);
});

test("cached result can power mode switching without another paid run", async () => {
  const repository = createMemoryWardrobeRepositoryV1();
  const key = buildAnalysisCacheKeyV1({ imageHash: "abc", pipelineVersion: "v1" });
  await repository.saveCachedAnalysis(key, { best_mode: "Balance", mode_scores: [70, 60, 50] });
  assert.deepEqual(await repository.getCachedAnalysis(key), { best_mode: "Balance", mode_scores: [70, 60, 50] });
});

test("wardrobe archive preserves future planning and the authoritative VisionCore result", async () => {
  const repository = createMemoryWardrobeRepositoryV1();
  const saved = await repository.saveLook("account-1", {
    title: "October event",
    occasion_tags: ["Formal"],
    planned_wear_at: "2026-10-15T19:00:00Z",
    favorite: true,
    visioncore_result: { upper: { hex: "#935234" }, lower: { hex: "#3F5041" } },
  });
  const looks = await repository.listLooks("account-1");
  assert.equal(looks.length, 1);
  assert.equal(looks[0].id, saved.id);
  assert.equal(looks[0].planned_wear_at, "2026-10-15T19:00:00Z");
  assert.equal(looks[0].visioncore_result.lower.hex, "#3F5041");
});
