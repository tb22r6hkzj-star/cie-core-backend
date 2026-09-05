import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildAccessorySpatialGuidanceRequestV2 } from '../src/intelligence/external/openAIAccessorySpatialGuidanceV2.js';
import { clipDetectionToMicroCropV1 } from '../src/intelligence/accessoryMicroCropRuntimeV1.js';

test('OpenAI accessory spatial guidance requests target, exclusions, material and appearance without numeric color authority', () => {
  const request = buildAccessorySpatialGuidanceRequestV2({ imageUrl: 'https://example.test/look.jpg', targetType: 'watch' });
  const schema = request.text.format.schema;
  for (const field of ['target_bbox', 'focus_bbox', 'exclusions', 'material', 'perceived_color_family', 'appearance_note']) {
    assert.ok(schema.required.includes(field));
  }
  const prompt = request.input[0].content[0].text;
  assert.match(prompt, /Exclude wrist, hand, skin, tattoos, sleeve, shirt, and background/i);
  assert.match(prompt, /Never provide HEX, RGB, LAB/i);
});

test('validated micro-crop detection carries semantic exclusion geometry into VisionCore', () => {
  const guidance = {
    exclusions: [
      { type: 'skin', confidence: 0.95, bbox: { x: 0.40, y: 0.50, width: 0.10, height: 0.08 } },
      { type: 'garment', confidence: 0.88, bbox: { x: 0.32, y: 0.46, width: 0.08, height: 0.10 } },
    ],
    material: 'metallic',
    perceived_color_family: 'gold',
    appearance_note: 'Pale areas appear reflective rather than intrinsic.',
  };
  const detection = { label: 'watch', bbox: { x: 0.35, y: 0.45, width: 0.20, height: 0.18 } };
  const clipped = clipDetectionToMicroCropV1(detection, { x: 0.36, y: 0.46, width: 0.17, height: 0.15 }, guidance);
  assert.equal(clipped.accessory_semantic_exclusions_v2.length, 2);
  assert.equal(clipped.accessory_material_hypothesis_v2, 'metallic');
  assert.equal(clipped.accessory_perceived_color_family_v2, 'gold');
  assert.equal(clipped.external_color_authority, false);
});

test('piece ownership V1 operationally passes semantic exclusions into both jewelry samplers', () => {
  const source = fs.readFileSync(new URL('../src/intelligence/pieceColorOwnershipV1.js', import.meta.url), 'utf8');
  assert.match(source, /function accessorySemanticExclusionBoxesV2/);
  assert.match(source, /exclusions: semanticExclusions[\s\S]*?insetRatio: zone === "accessory_jewelry" \? 0\.24/);
  assert.match(source, /exclusions: semanticExclusions[\s\S]*?insetRatio: zone === "accessory_jewelry" \? 0\.33/);
  assert.match(source, /semantic_exclusion_count_v2/);
  assert.match(source, /outer_excluded_sample_count_v2/);
  assert.match(source, /inner_excluded_sample_count_v2/);
});
