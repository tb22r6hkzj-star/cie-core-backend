import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileAccessoryPublicationV1 } from '../src/intelligence/accessoryPublicationBridgeV1.js';

function legacyZone(label, hex, confidence = 0.45) {
  return {
    label,
    display_zone_label: label,
    hex,
    confidence,
    region_colors: [{ hex, pct: 1 }],
    detected_colors: [{ hex, pct: 1 }],
    secondary_colors: [{ hex, pct: 0.2 }],
  };
}

test('legacy earring color is suppressed when no authoritative accessory instance exists', () => {
  const analysis = {
    accessory_instances_v1: { instances: [], zones: {} },
    garment_zones: { zones: { earrings: legacyZone('earrings', '#DCB091', 0.45) } },
  };
  const next = reconcileAccessoryPublicationV1(analysis);
  assert.equal(next.garment_zones.zones.earrings.hex, null);
  assert.equal(next.garment_zones.zones.earrings.color_publication_decision, 'withhold_unvalidated_color');
  assert.equal(next.garment_zones.zones.earrings.accessory_final_publication_gate_v1, true);
});

test('withheld authoritative watch instance replaces stale legacy watch palette even without ownership regions', () => {
  const withheld = {
    zone_key: 'accessory_watch', accessory_type: 'watch', object_type: 'watch', label: 'watch',
    hex: null, object_local_colors: [], color_publication_decision: 'withhold_unisolated_color', validation_decision: 'identity_only'
  };
  const analysis = {
    accessory_instances_v1: { instances: [withheld], zones: { accessory_watch: withheld } },
    garment_zones: { zones: { watch: legacyZone('watch', '#DDC4A0', 0.79) } },
  };
  const next = reconcileAccessoryPublicationV1(analysis);
  assert.equal(next.garment_zones.zones.watch.hex, null);
  assert.equal(next.garment_zones.zones.watch.color_publication_decision, 'withhold_unisolated_color');
});

// workflow trigger
