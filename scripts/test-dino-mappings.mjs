import assert from 'node:assert/strict';

import {
  DINO_LABEL_MAPPINGS,
  getDinoMapping,
  mapDinoLabel,
} from '../src/engines/ontology/dinoMappings.js';

assert.ok(Array.isArray(DINO_LABEL_MAPPINGS), 'DINO_LABEL_MAPPINGS should be an array');
assert.ok(DINO_LABEL_MAPPINGS.length > 0, 'DINO_LABEL_MAPPINGS should not be empty');

assert.equal(getDinoMapping('hoodie')?.category, 'hoodie');
assert.equal(getDinoMapping('hoodie')?.zone, 'upper_garment');
assert.equal(getDinoMapping('hat')?.zone, 'accessory_jewelry');
assert.equal(getDinoMapping('sweater')?.zone, 'upper_garment');

assert.equal(getDinoMapping('sneakers')?.category, 'sneakers');
assert.equal(getDinoMapping('sneakers')?.zone, 'footwear');
assert.equal(getDinoMapping('boots')?.zone, 'footwear');
assert.equal(getDinoMapping('shorts')?.zone, 'lower_garment');
assert.equal(getDinoMapping('skirt')?.zone, 'lower_garment');

assert.equal(getDinoMapping('unknown object'), null);

assert.equal(mapDinoLabel('watch').category, 'accessory');
assert.equal(mapDinoLabel('watch').zone, 'accessory_jewelry');

assert.equal(mapDinoLabel('unknown object').category, 'piece');
assert.equal(mapDinoLabel('unknown object').zone, 'unknown');
assert.equal(mapDinoLabel('unknown object').confidence_floor, 0);

assert.equal(mapDinoLabel('HOODIE').category, 'hoodie');

console.log('DINO MAPPING TESTS PASSED');
