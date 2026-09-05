import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalizeInstance, applyAccessoryCanonicalPublicationV2 } from '../src/intelligence/accessoryCanonicalPublicationV2.js';

test('published watch rewrites every customer-facing color alias from one authority', () => {
  const next = canonicalizeInstance({
    accessory_type:'watch',
    name:'Camel',
    color_publication_decision:'publish_owned_color',
    color_authority_source:'piece_color_ownership_v1',
    hex:'#C8A24A',
    dominant_hex:'#DDC4A0',
    primary_color:{hex:'#C8A24A',pct:.7},
    dominant_color:{hex:'#DDC4A0',pct:.9},
    signature_color:{hex:'#DDC4A0'},
    object_local_colors:[{hex:'#C8A24A',pct:.7},{hex:'#F5E4B7',pct:.3}],
    region_colors:[{hex:'#C8A24A',pct:.7},{hex:'#F5E4B7',pct:.3}],
    detected_colors:[{hex:'#DDC4A0',pct:.9}],
  });
  assert.equal(next.name,'Watch');
  assert.equal(next.hex,'#C8A24A');
  assert.equal(next.dominant_hex,'#C8A24A');
  assert.equal(next.primary_color.hex,'#C8A24A');
  assert.equal(next.dominant_color.hex,'#C8A24A');
  assert.equal(next.signature_color.hex,'#C8A24A');
  assert.equal(next.detected_colors[0].hex,'#C8A24A');
  assert.equal(next.accessory_canonical_publication_v2.state,'published');
});

test('withheld earring clears Camel from every customer-facing alias', () => {
  const next = canonicalizeInstance({
    accessory_type:'earrings',
    name:'Camel',
    color_publication_decision:'withhold_unvalidated_color',
    hex:'#DCB091',
    dominant_hex:'#DCB091',
    primary_color:{hex:'#DCB091'},
    dominant_color:{hex:'#DCB091'},
    signature_color:{hex:'#EDDECE'},
    region_colors:[{hex:'#DCB091'}],
    detected_colors:[{hex:'#DCB091'}],
  });
  assert.equal(next.name,'Earrings');
  assert.equal(next.hex,null);
  assert.equal(next.dominant_hex,null);
  assert.equal(next.primary_color,null);
  assert.equal(next.dominant_color,null);
  assert.equal(next.signature_color,null);
  assert.deepEqual(next.region_colors,[]);
  assert.deepEqual(next.detected_colors,[]);
  assert.equal(next.accessory_canonical_publication_v2.state,'withheld');
});

test('payload canonicalizer replaces visible legacy accessory zone with canonical instance', () => {
  const payload = {
    outfit_analysis:{
      accessory_instances_v1:{instances:[{
        zone_key:'accessory_watch', accessory_type:'watch', name:'Camel',
        color_publication_decision:'publish_owned_color', hex:'#C8A24A',
        primary_color:{hex:'#C8A24A'}, object_local_colors:[{hex:'#C8A24A'}], region_colors:[{hex:'#C8A24A'}],
      }]},
      garment_zones:{zones:{accessory_watch:{accessory_type:'watch',name:'Camel',hex:'#DDC4A0',detected_colors:[{hex:'#DDC4A0'}]}}},
    },
  };
  const next = applyAccessoryCanonicalPublicationV2(payload);
  const zone = next.outfit_analysis.garment_zones.zones.accessory_watch;
  assert.equal(zone.name,'Watch');
  assert.equal(zone.hex,'#C8A24A');
  assert.equal(zone.detected_colors[0].hex,'#C8A24A');
});
