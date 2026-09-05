import test from 'node:test';
import assert from 'node:assert/strict';
import { attachAccessoryPositiveMaskOwnershipV1 } from '../src/intelligence/accessoryPositiveMaskOwnershipV1.js';

test('watch receives a compact target-conditioned SAM positive mask and mask colors', () => {
  const watch = { id:'watch1', zone:'accessory_jewelry', label:'watch', confidence:.9, bbox:{x:.66,y:.42,width:.08,height:.08} };
  const bad = { id:'sam_bad', source_type:'sam_segment', confidence:.9, mask_url:'bad', mask_geometry:{bbox:{x:.1,y:.1,w:.2,h:.2}}, region_colors:[{hex:'#111111',pct:1}] };
  const good = { id:'sam_watch', source_type:'sam_segment', confidence:.88, mask_url:'good', mask_geometry:{bbox:{x:.665,y:.425,w:.065,h:.065}}, region_colors:[{hex:'#C8A24A',pct:.7},{hex:'#F5E4B7',pct:.3}] };
  const [next] = attachAccessoryPositiveMaskOwnershipV1([watch],[bad,good]);
  assert.equal(next.positive_accessory_mask_v1.validated,true);
  assert.equal(next.positive_accessory_mask_v1.sam_region_id,'sam_watch');
  assert.equal(next.positive_accessory_mask_v1.reason,'target_conditioned_sam_positive_mask');
  assert.equal(next.accessory_positive_mask_colors[0].hex,'#C8A24A');
});

test('broad wrist/skin SAM segment cannot become watch authority by overlap alone', () => {
  const watch = {
    id:'watch1', zone:'accessory_jewelry', label:'watch', confidence:.9,
    bbox:{x:.66,y:.42,width:.08,height:.08},
    accessory_semantic_exclusions_v2:[
      { type:'skin', confidence:.96, bbox:{x:.62,y:.39,width:.18,height:.16} },
    ],
  };
  const wrist = {
    id:'sam_wrist', source_type:'sam_segment', confidence:.95, mask_url:'wrist',
    mask_geometry:{bbox:{x:.62,y:.39,w:.18,h:.16}},
    region_colors:[{hex:'#DCB091',pct:.72},{hex:'#A08060',pct:.28}],
  };
  const [next] = attachAccessoryPositiveMaskOwnershipV1([watch],[wrist]);
  assert.equal(next.positive_accessory_mask_v1.validated,false);
  assert.equal(next.accessory_positive_mask_colors.length,0);
});

test('watch without target-conditioned SAM mask is explicitly marked unvalidated', () => {
  const watch = { id:'watch1', zone:'accessory_jewelry', label:'watch', confidence:.9, bbox:{x:.66,y:.42,width:.08,height:.08} };
  const [next] = attachAccessoryPositiveMaskOwnershipV1([watch],[]);
  assert.equal(next.positive_accessory_mask_v1.validated,false);
  assert.equal(next.positive_accessory_mask_v1.reason,'target_conditioned_positive_accessory_mask_required');
});
