import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveAccessoryEvidenceV1 } from '../src/intelligence/accessoryEvidenceContractV1.js';

// Accessory Evidence Contract V1 keeps identity and color authority independent.
test('targeted spatial identity survives color measurement failure', () => {
  const result = resolveAccessoryEvidenceV1({
    entry: { source: 'grounding_dino', confidence: 0.81 },
    type: 'watch',
    confidenceFloor: 0.46,
    targetedIdentity: true,
    measurementAccepted: false,
    pixelSupported: false,
    colorsAvailable: false,
  });
  assert.equal(result.identity_state, 'confirmed');
  assert.equal(result.publish_identity, true);
  assert.equal(result.publish_color, false);
  assert.equal(result.color_state, 'withheld');
  assert.equal(result.external_color_authority, false);
});

test('primary spatial identity survives color measurement failure', () => {
  const result = resolveAccessoryEvidenceV1({
    entry: { source: 'grounding_dino', confidence: 0.78 },
    type: 'watch',
    confidenceFloor: 0.46,
    targetedIdentity: false,
    measurementAccepted: false,
    pixelSupported: false,
    colorsAvailable: false,
  });
  assert.equal(result.identity_state, 'confirmed');
  assert.equal(result.publish_identity, true);
  assert.equal(result.publish_color, false);
  assert.equal(result.color_state, 'withheld');
  assert.equal(result.identity_authority_source, 'visioncore_spatial_detection');
});

test('low-confidence primary spatial detection stays suppressed', () => {
  const result = resolveAccessoryEvidenceV1({
    entry: { source: 'grounding_dino', confidence: 0.31 },
    type: 'watch',
    confidenceFloor: 0.46,
    targetedIdentity: false,
    measurementAccepted: false,
    pixelSupported: false,
    colorsAvailable: false,
  });
  assert.equal(result.identity_state, 'insufficient');
  assert.equal(result.publish_identity, false);
  assert.equal(result.publish_color, false);
});

test('measurement success cannot publish color without supported owned pixels', () => {
  const result = resolveAccessoryEvidenceV1({
    entry: { source: 'grounding_dino', confidence: 0.83 },
    type: 'earrings',
    confidenceFloor: 0.52,
    targetedIdentity: true,
    measurementAccepted: true,
    pixelSupported: false,
    colorsAvailable: true,
  });
  assert.equal(result.publish_identity, true);
  assert.equal(result.publish_color, false);
  assert.equal(result.color_authority_source, null);
});

test('explicit identity challenge can overturn a targeted identity', () => {
  const result = resolveAccessoryEvidenceV1({
    entry: { source: 'grounding_dino', confidence: 0.92, identity_challenged: true },
    type: 'watch',
    confidenceFloor: 0.46,
    targetedIdentity: true,
    measurementAccepted: true,
    pixelSupported: true,
    colorsAvailable: true,
  });
  assert.equal(result.identity_state, 'challenged');
  assert.equal(result.publish_identity, false);
  assert.equal(result.publish_color, false);
});

test('explicit spatial or scene rejection suppresses otherwise supported identity', () => {
  for (const rejection_scope of ['spatial', 'scene']) {
    const result = resolveAccessoryEvidenceV1({
      entry: { source: 'grounding_dino', confidence: 0.92, rejection_scope },
      type: 'watch',
      confidenceFloor: 0.46,
      measurementAccepted: false,
    });
    assert.equal(result.identity_state, 'rejected');
    assert.equal(result.publish_identity, false);
    assert.equal(result.publish_color, false);
  }
});

test('color or mask rejection does not erase supported spatial identity', () => {
  for (const rejection_scope of ['color', 'mask']) {
    const result = resolveAccessoryEvidenceV1({
      entry: { source: 'grounding_dino', confidence: 0.92, rejection_scope },
      type: 'watch',
      confidenceFloor: 0.46,
      measurementAccepted: false,
      pixelSupported: false,
      colorsAvailable: false,
    });
    assert.equal(result.identity_state, 'confirmed');
    assert.equal(result.publish_identity, true);
    assert.equal(result.publish_color, false);
  }
});

test('semantic-only evidence cannot become VisionCore identity authority', () => {
  const result = resolveAccessoryEvidenceV1({
    entry: { source: 'openai_semantic', confidence: 0.99 },
    type: 'watch',
    confidenceFloor: 0.46,
    targetedIdentity: true,
    measurementAccepted: true,
    pixelSupported: true,
    colorsAvailable: true,
  });
  assert.equal(result.publish_identity, false);
  assert.equal(result.external_color_authority, false);
});
