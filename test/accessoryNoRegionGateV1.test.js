import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileAccessoryPublicationV1 } from '../src/intelligence/accessoryPublicationBridgeV1.js';

// Live regression: stale watch palette must not survive without ownership authority.
test('stale watch instance cannot publish color without validated ownership region', () => {
  const staleWatch = {
    zone_key: 'accessory_watch',
    accessory_type: 'watch',
    object_type: 'watch',
    label: 'watch',
    hex: '#DDC4A0',
    region_colors: [
      { hex: '#DDC4A0', pct: 0.09 },
      { hex: '#BEA381', pct: 0.07 },
      { hex: '#A08060', pct: 0.05 },
      { hex: '#7E6142', pct: 0.05 },
    ],
    detected_colors: [{ hex: '#DDC4A0', pct: 0.09 }],
    color_publication_decision: 'publish_object_local_color',
    validation_decision: 'accepted',
  };
  const analysis = {
    accessory_instances_v1: { instances: [staleWatch], zones: { accessory_watch: staleWatch } },
    garment_zones: { zones: { watch: { ...staleWatch, zone_key: 'watch' } } },
  };
  const next = reconcileAccessoryPublicationV1(analysis);
  assert.equal(next.accessory_instances_v1.instances[0].hex, null);
  assert.equal(next.accessory_instances_v1.instances[0].color_publication_decision, 'withhold_unvalidated_color');
  assert.equal(next.garment_zones.zones.watch.hex, null);
  assert.equal(next.garment_zones.zones.watch.validation_reason, 'no_validated_accessory_ownership_region');
});
