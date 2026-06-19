import assert from 'node:assert/strict';

import { inferAccessoryDisplayMetadata } from '../src/ui/accessoryDisplay.js';

assert.deepEqual(inferAccessoryDisplayMetadata(['hat']), {
  display_zone_label: 'Headwear',
  accessory_type: 'hat',
  object_type: 'hat',
});
assert.deepEqual(inferAccessoryDisplayMetadata(['baseball cap']), {
  display_zone_label: 'Headwear',
  accessory_type: 'hat',
  object_type: 'hat',
});
assert.deepEqual(inferAccessoryDisplayMetadata(['gold chain']), {
  display_zone_label: 'Jewelry',
  accessory_type: 'necklace',
  object_type: 'necklace',
});
assert.deepEqual(inferAccessoryDisplayMetadata(['watch']), {
  display_zone_label: 'Watch',
  accessory_type: 'watch',
  object_type: 'watch',
});
assert.deepEqual(inferAccessoryDisplayMetadata(['ring']), {
  display_zone_label: 'Ring',
  accessory_type: 'ring',
  object_type: 'ring',
});
assert.deepEqual(inferAccessoryDisplayMetadata(['bracelet']), {
  display_zone_label: 'Bracelet',
  accessory_type: 'bracelet',
  object_type: 'bracelet',
});
assert.deepEqual(inferAccessoryDisplayMetadata(['accessory']), {
  display_zone_label: 'Accessory',
  accessory_type: null,
  object_type: 'accessory',
});

console.log('ACCESSORY DISPLAY METADATA TESTS PASSED');
