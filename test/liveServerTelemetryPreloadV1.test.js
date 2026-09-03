import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import {
  attachReasoningCards,
  getLiveServerTelemetryStatusV1,
} from "../src/intelligence/liveServerTelemetryPreloadV1.js";

async function withServer(app, fn) {
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  try {
    const address = server.address();
    await fn(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("live preload records recommendation latency and exposes debug status", async () => {
  const app = express();
  app.get("/api/debug/status", (_req, res) => res.json({ ok: true, service: "test" }));
  app.post("/api/recommendations", async (_req, res) => {
    await new Promise((resolve) => setTimeout(resolve, 5));
    res.json({
      success: true,
      outfit_analysis: {
        external_intelligence: {
          latency_ms: 3,
          runtime_second_pass_v1: {
            executed_count: 1,
            latency_ms: 2,
            results: [{ plan: { action: "semantic_reassessment" } }],
          },
        },
      },
    });
  });

  await withServer(app, async (baseUrl) => {
    const recommendation = await fetch(`${baseUrl}/api/recommendations`, { method: "POST" });
    assert.equal(recommendation.status, 200);
    const recommendationBody = await recommendation.json();
    assert.equal(recommendationBody.success, true);

    const statusResponse = await fetch(`${baseUrl}/api/debug/status`);
    assert.equal(statusResponse.status, 200);
    const statusBody = await statusResponse.json();
    assert.equal(statusBody.ok, true);
    assert.equal(statusBody.analysis_latency.version, "analysis_latency_runtime_v1");
    assert.ok(statusBody.analysis_latency.aggregate.sample_count >= 1);
    assert.equal(statusBody.analysis_latency.latest.second_pass.used, true);
    assert.equal(statusBody.analysis_latency.latest.second_pass.action, "semantic_reassessment");
    assert.equal(statusBody.analysis_latency.policy.stores_image_data, false);
  });

  assert.ok(getLiveServerTelemetryStatusV1().aggregate.sample_count >= 1);
});

test("images transform route is timed and receives accessory publication guard", async () => {
  const app = express();
  app.get("/api/debug/status", (_req, res) => res.json({ ok: true }));
  app.post("/api/images/transform", (_req, res) => {
    const staleWatch = {
      instance_id: "watch_1",
      zone_key: "accessory_watch",
      accessory_type: "watch",
      label: "watch",
      hex: "#DDC4A0",
      dominant_color: { hex: "#DDC4A0", pct: 0.09 },
      object_local_colors: [{ hex: "#DDC4A0", pct: 0.09 }],
      color_publication_decision: "publish_object_local_color",
    };
    res.json({
      success: true,
      outfit_analysis: {
        segmented_regions: [{
          id: "watch_detection",
          zone: "accessory_jewelry",
          label: "watch",
          accessory_type: "watch",
          confidence: 0.92,
          dominant_hex: "#C69B43",
          region_colors: [{ hex: "#C69B43", pct: 0.88, pixel_count: 44 }],
          color_debug: { piece_color_ownership_v1: { applied: true } },
        }],
        accessory_instances_v1: {
          instances: [staleWatch],
          zones: { accessory_watch: staleWatch },
        },
        garment_zones: {
          zones: { accessory_watch: staleWatch },
          accessory_instances: [staleWatch],
        },
      },
      debug: {
        external_intelligence: {
          latency_ms: 4,
          semantic_reconciliation: { candidates: [] },
        },
      },
    });
  });

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/images/transform`, { method: "POST" });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.outfit_analysis.garment_zones.zones.accessory_watch.hex, "#C69B43");
    assert.equal(body.outfit_analysis.accessory_instances_v1.instances[0].hex, "#C69B43");

    const statusResponse = await fetch(`${baseUrl}/api/debug/status`);
    const statusBody = await statusResponse.json();
    assert.ok(statusBody.analysis_latency.aggregate.sample_count >= 1);
    assert.ok(statusBody.analysis_latency.latest.stages_ms.route_images_transform >= 0);
  });
});

test("live reasoning cards explain appearance without changing VisionCore measured color", () => {
  const payload = {
    success: true,
    outfit_analysis: {
      garment_zones: {
        zones: {
          upper_garment: {
            primary_color: { hex: "#6F263D" },
          },
        },
      },
      external_intelligence: {
        semantic_reconciliation: {
          candidates: [{
            piece: "upper_garment",
            color_crosscheck: {
              disposition: "visioncore_strong_measurement_preserved",
              openai_hypothesis: {
                family: "brown",
                appearance_cue: "brownish burgundy",
                lighting_cue: "warm indoor lighting",
                confidence: 0.91,
                numeric_color_supplied: false,
              },
              visioncore_measurement: {
                available: true,
                family: "red",
                hex: "#6F263D",
                confidence: 0.94,
                source: "visioncore_object_local_measurement",
              },
              semantic_reassessment_requested: true,
              remeasurement_requested: false,
              bidirectional_challenge: {
                disagreement: true,
                nuance_synthesis_required: true,
              },
            },
          }],
        },
      },
    },
  };

  const result = attachReasoningCards(payload);
  const card = result.outfit_analysis.reasoning_cards_v1.cards[0];
  assert.equal(card.piece, "upper_garment");
  assert.equal(card.measured_color, "#6F263D");
  assert.equal(card.appearance_note, "Appears brownish burgundy");
  assert.equal(card.reason, "Warm lighting");
  assert.equal(result.outfit_analysis.garment_zones.zones.upper_garment.primary_color.hex, "#6F263D");
  assert.equal(result.outfit_analysis.reasoning_cards_v1.measured_hex_changed, false);
  assert.equal(result.outfit_analysis.reasoning_cards_v1.publication_changed, false);
});
