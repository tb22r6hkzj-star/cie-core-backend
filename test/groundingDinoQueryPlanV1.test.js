import test from "node:test";
import assert from "node:assert/strict";
import { buildGroundingDinoQueryPlanV1 } from "../src/intelligence/groundingDinoQueryPlanV1.js";

test("custom primary env query cannot disable dedicated accessory lane", () => {
  const plan = buildGroundingDinoQueryPlanV1({
    configuredPrimaryQuery: "person. shirt. pants. shoes.",
    defaultGarmentQuery: "shirt. pants. shoes.",
    accessoryQuery: "watch. earring. stud earring.",
  });
  assert.equal(plan.primary_source, "environment_override");
  assert.equal(plan.dedicated_accessory_lane, true);
  assert.equal(plan.parallel_pass_count, 2);
  assert.deepEqual(plan.queries, [
    "person. shirt. pants. shoes.",
    "watch. earring. stud earring.",
  ]);
});

test("default garment pass still runs beside dedicated accessory lane when env is unset", () => {
  const plan = buildGroundingDinoQueryPlanV1({
    configuredPrimaryQuery: "",
    defaultGarmentQuery: "shirt. pants. shoes.",
    accessoryQuery: "watch. earring.",
  });
  assert.equal(plan.primary_source, "visioncore_default_garment_query");
  assert.deepEqual(plan.queries, ["shirt. pants. shoes.", "watch. earring."]);
});
