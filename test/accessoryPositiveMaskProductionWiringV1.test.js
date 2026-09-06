import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('production wires positive accessory masks before piece color ownership', () => {
  const source = fs.readFileSync(new URL('../src/server.js', import.meta.url), 'utf8');
  assert.match(source, /attachAccessoryPositiveMaskOwnershipV1/);
  assert.match(source, /positiveMaskDinoRegions/);
  assert.match(source, /samRegions\.concat\((?:recoveredPositiveMaskDinoRegions|positiveMaskDinoRegions)\)/);
});

test('jewelry ownership consumes positive mask evidence before nested rectangle sampling', () => {
  const source = fs.readFileSync(new URL('../src/intelligence/pieceColorOwnershipV1.js', import.meta.url), 'utf8');
  assert.match(source, /positive_accessory_mask_v1/);
  assert.match(source, /accessory_positive_mask_pixels/);
  assert.match(source, /positive_mask_membership_precedes_jewelry_color/);
  assert.match(source, /positive_accessory_mask_required/);
});
