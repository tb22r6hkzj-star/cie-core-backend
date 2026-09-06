import test from "node:test";
import assert from "node:assert/strict";
import { analyzePerceptionV5 } from "../src/intelligence/perceptionV5/index.js";
import { analyzePerceptionV6 } from "../src/intelligence/perceptionV6/index.js";
import { buildAccessoryInstancesV1 } from "../src/intelligence/accessoryInstancesV1.js";

test("targeted VisionCore accessory provenance survives Perception V6 into accessory publication", () => {
  const regions = [{
    id: "targeted_dino_1",
    source_type: "grounding_dino",
    zone: "accessory_jewelry",
    label: "watch",
    segment_label: "watch",
    confidence: 0.5,
    targeted_reanalysis_v1: true,
    bbox: { x: 0.62, y: 0.44, width: 0.08, height: 0.07 },
  }];

  const perceptionV5 = analyzePerceptionV5({ regions, pipeline: { dino_ok: true } });
  const perceptionV6 = analyzePerceptionV6({ perceptionV5, regions, decodedImage: null, mode: "assist" });
  const ledger = perceptionV6.evidence_ledger.find((entry) => entry.id === "targeted_dino_1");

  assert.ok(ledger);
  assert.equal(ledger.source, "grounding_dino");
  assert.equal(ledger.targeted_reanalysis_v1, true);

  const accessories = buildAccessoryInstancesV1({ perceptionV6 });
  assert.equal(accessories.detected_count, 1);
  assert.equal(accessories.instances[0].accessory_type, "watch");
  assert.equal(accessories.instances[0].identity_first_publication_v1, true);
  assert.equal(accessories.instances[0].identity_authority_source, "visioncore_targeted_spatial_detection");
});
