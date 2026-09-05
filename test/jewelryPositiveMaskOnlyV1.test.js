import test from 'node:test';
import assert from 'node:assert/strict';
import { applyPieceColorOwnershipV1 } from '../src/intelligence/pieceColorOwnershipV1.js';

function image(width = 100, height = 100, hex = '#DCB091') {
  const value = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => Number.parseInt(value.slice(i, i + 2), 16));
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    const j = i * 4;
    data[j] = r; data[j + 1] = g; data[j + 2] = b; data[j + 3] = 255;
  }
  return { width, height, data };
}

function jewelry(label, hex = '#DCB091') {
  return {
    id: `${label}_legacy_box`,
    zone: 'accessory_jewelry',
    label,
    segment_label: label,
    accessory_type: label === 'earrings' ? 'earrings' : 'watch',
    object_type: label === 'earrings' ? 'earrings' : 'watch',
    source_type: 'grounding_dino',
    confidence: 0.91,
    bbox: { x: 0.30, y: 0.30, width: 0.20, height: 0.20 },
    dominant_hex: hex,
    region_colors: [{ hex, pct: 1 }],
  };
}

test('watch cannot publish stable rectangle color without a positive accessory mask', () => {
  const region = jewelry('watch', '#DDC4A0');
  const result = applyPieceColorOwnershipV1({ decodedImage: image(100, 100, '#DDC4A0'), regions: [region] });
  const measured = result.regions[0];
  assert.equal(measured.color_debug.piece_color_ownership_v1.applied, false);
  assert.equal(measured.color_debug.piece_color_ownership_v1.reason, 'positive_accessory_mask_required');
  assert.equal(measured.dominant_hex, '#DDC4A0');
});

test('earrings cannot publish stable skin-like rectangle color without a positive accessory mask', () => {
  const region = jewelry('earrings', '#DCB091');
  const result = applyPieceColorOwnershipV1({ decodedImage: image(100, 100, '#DCB091'), regions: [region] });
  const measured = result.regions[0];
  assert.equal(measured.color_debug.piece_color_ownership_v1.applied, false);
  assert.equal(measured.color_debug.piece_color_ownership_v1.reason, 'positive_accessory_mask_required');
});

test('validated positive-mask colors remain eligible for jewelry authority', () => {
  const region = {
    ...jewelry('watch', '#DDC4A0'),
    positive_accessory_mask_v1: {
      version: 'accessory_positive_mask_ownership_v2',
      validated: true,
      reason: 'target_conditioned_sam_positive_mask',
      confidence: 0.92,
      sam_region_id: 'watch_mask',
    },
    accessory_positive_mask_colors: [
      { hex: '#C89A32', pct: 0.82, pixel_count: 61 },
      { hex: '#8A6327', pct: 0.18, pixel_count: 13 },
    ],
  };
  const result = applyPieceColorOwnershipV1({ decodedImage: image(), regions: [region] });
  const measured = result.regions[0];
  assert.equal(measured.color_debug.piece_color_ownership_v1.applied, true);
  assert.equal(measured.region_colors[0].source, 'accessory_positive_mask_pixels');
  assert.equal(measured.dominant_hex, '#C89A32');
});
