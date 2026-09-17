import test from "node:test";
import assert from "node:assert/strict";
import {
  benchmarkCollectionRequestedV1,
  buildLiveBenchmarkRecordV1,
  getLiveBenchmarkStatusV1,
  persistLiveBenchmarkRecordV1,
} from "../src/evaluation/liveBenchmarkLedgerV1.js";

test("benchmark collection is explicit per request", () => {
  assert.equal(benchmarkCollectionRequestedV1({ body: { benchmarkMode: "true" } }), true);
  assert.equal(benchmarkCollectionRequestedV1({ headers: { "x-visioncore-benchmark": "collect" } }), true);
  assert.equal(benchmarkCollectionRequestedV1({ body: {} }), false);
});

test("builds an immutable unreviewed record with image fingerprint and raw output", () => {
  const record = buildLiveBenchmarkRecordV1({
    id: "VC-TEST-001",
    now: new Date("2026-09-17T12:00:00.000Z"),
    startedAtMs: 100,
    finishedAtMs: 250,
    req: {
      files: [{ originalname: "outfit.jpg", mimetype: "image/jpeg", buffer: Buffer.from("image") }],
    },
    payload: { success: true, engine: "V2", outfit_analysis: { garment_zones: { zones: {} } } },
  });

  assert.equal(record.run_id, "VC-TEST-001");
  assert.equal(record.collection_status, "captured_unreviewed");
  assert.equal(record.benchmark_eligible, false);
  assert.equal(record.runtime.total_ms, 150);
  assert.equal(record.source.original_filename, "outfit.jpg");
  assert.match(record.source.sha256, /^[a-f0-9]{64}$/);
  assert.equal(record.original_result.success, true);
  assert.equal(record.policy.original_result_is_immutable, true);
});

test("persists records as authenticated raw Cloudinary assets", async () => {
  const calls = [];
  const record = buildLiveBenchmarkRecordV1({ id: "VC-TEST-002", payload: { success: true } });
  const result = await persistLiveBenchmarkRecordV1(record, {
    uploader: { upload: async (...args) => { calls.push(args); return { public_id: "stored/id", bytes: 42 }; } },
  });
  assert.equal(result.stored, true);
  assert.equal(result.public_id, "stored/id");
  assert.equal(calls[0][1].type, "authenticated");
  assert.equal(calls[0][1].resource_type, "raw");
  assert.match(calls[0][0], /^data:application\/json;base64,/);
});

test("status counts every captured page without exposing records", async () => {
  let call = 0;
  const status = await getLiveBenchmarkStatusV1({
    api: { resources: async () => (++call === 1 ? { resources: [{}, {}], next_cursor: "next" } : { resources: [{}] }) },
  });
  assert.equal(status.captured_unreviewed, 3);
  assert.equal(status.remaining_to_capture, 97);
  assert.equal("records" in status, false);
});
