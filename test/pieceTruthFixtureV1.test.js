import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { evaluatePieceTruthFixtureV1 } from "../src/evaluation/pieceTruthFixtureV1.js";

const fixture = JSON.parse(fs.readFileSync(
  new URL("../evaluation/fixtures/dark-monogram-silver-jewelry-v1.json", import.meta.url),
  "utf8"
));

function color(hex, name, pct = 1) {
  return { hex, name, pct, ownership_validated: true };
}

function garment(garmentType, primary, secondary = [], extras = {}) {
  return {
    garment_type: garmentType,
    primary_color: primary,
    region_colors: [primary, ...secondary],
    detected_colors: [primary, ...secondary],
    color_mode: secondary.length ? "multi_color" : "single_color",
    color_publication_decision: "publish",
    ...extras,
  };
}

function accessory(type, hex = "#C9C8C5") {
  const primary = color(hex, "Silver Tone");
  return {
    accessory_type: type,
    semantic_instance_key: `${type}_1`,
    primary_color: primary,
    object_local_colors: [primary],
    color_publication_decision: "publish_validated_silver_tone",
    validation_decision: "accepted",
  };
}

function passingPayload() {
  const darkBrown = color("#2B2420", "Deep Espresso", 0.76);
  const taupe = color("#75675C", "Warm Taupe", 0.24);
  const white = color("#EEEEED", "Soft White");
  const instances = [accessory("necklace"), accessory("ring"), accessory("bracelet"), accessory("watch")];
  return {
    garment_zones: {
      zones: {
        upper_garment: garment("shirt", white),
        outerwear: garment("jacket", darkBrown, [taupe], { pattern: "repeating_monogram" }),
        lower_garment: garment("trousers", darkBrown, [taupe], { pattern: "repeating_monogram" }),
        footwear: garment("footwear", white),
        accessory_necklace_1: instances[0],
        accessory_ring_1: instances[1],
        accessory_bracelet_1: instances[2],
        accessory_watch_1: instances[3],
      },
      accessory_instances: instances,
    },
    accessory_instances_v1: { instances },
    accessory_analysis: instances,
  };
}

test("the approved outfit fixture accepts one coherent canonical piece truth", () => {
  const report = evaluatePieceTruthFixtureV1(fixture, passingPayload());
  assert.equal(report.passed, true, JSON.stringify(report.findings, null, 2));
  assert.equal(report.finding_count, 0);
});

test("the approved outfit fixture rejects the latest screenshot failure shape", () => {
  const white = color("#EEEEED", "Soft White");
  const payload = {
    garment_zones: {
      zones: {
        upper_garment: garment("shirt", color("#E1E1E8", "Linen White")),
        outerwear: garment("jacket", color("#3C332E", "Rich Brown")),
        lower_garment: garment("trousers", color("#2B2420", "Jet Black")),
        footwear: garment("footwear", white),
        accessory_necklace_1: { accessory_type: "necklace", semantic_instance_key: "necklace_1", color_publication_decision: "withhold_unvalidated_color" },
        accessory_ring_1: { accessory_type: "ring", semantic_instance_key: "ring_1", color_publication_decision: "withhold_unvalidated_color" },
        accessory_bracelet_1: { accessory_type: "bracelet", semantic_instance_key: "bracelet_1", color_publication_decision: "withhold_unvalidated_color" },
      },
    },
    accessory_instances_v1: { instances: [] },
  };
  const report = evaluatePieceTruthFixtureV1(fixture, payload);
  const codes = new Set(report.findings.map((finding) => `${finding.piece}:${finding.code}`));
  assert.equal(report.passed, false);
  assert.ok(codes.has("jacket:wrong_color_mode"));
  assert.ok(codes.has("jacket:missing_pattern_evidence"));
  assert.ok(codes.has("trousers:forbidden_primary_name"));
  assert.ok(codes.has("necklace:color_withheld"));
  assert.ok(codes.has("ring:color_withheld"));
  assert.ok(codes.has("bracelet:color_withheld"));
  assert.ok(codes.has("watch:missing_piece"));
});

test("the approved outfit fixture rejects drift between public projections", () => {
  const payload = passingPayload();
  payload.accessory_analysis = payload.accessory_analysis.map((row) => row.accessory_type === "watch"
    ? { ...row, primary_color: color("#2B2420", "Jet Black"), object_local_colors: [color("#2B2420", "Jet Black")] }
    : row);
  const report = evaluatePieceTruthFixtureV1(fixture, payload);
  assert.ok(report.findings.some((finding) => finding.piece === "watch" && finding.code === "projection_drift"));
});

test("ring matching does not borrow an earring instance", () => {
  const payload = passingPayload();
  delete payload.garment_zones.zones.accessory_ring_1;
  payload.garment_zones.zones.accessory_earrings_1 = accessory("earrings");
  payload.garment_zones.accessory_instances = payload.garment_zones.accessory_instances.filter((row) => row.accessory_type !== "ring");
  payload.accessory_instances_v1.instances = payload.accessory_instances_v1.instances.filter((row) => row.accessory_type !== "ring");
  payload.accessory_analysis = payload.accessory_analysis.filter((row) => row.accessory_type !== "ring");
  const report = evaluatePieceTruthFixtureV1(fixture, payload);
  assert.ok(report.findings.some((finding) => finding.piece === "ring" && finding.code === "missing_piece"));
});
