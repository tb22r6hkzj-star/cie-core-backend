import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeDinoBboxPrecisionV1,
  normalizeAccessoryCropV1,
  cropDecodedImageToPngV1,
  remapCropDetectionToFullImageV1,
  remapCropMaskRegionToFullImageV1,
} from "../src/intelligence/accessoryTrueMicroCropV1.js";

test("tiny normalized DINO boxes keep precision and do not collapse", () => {
  const box = normalizeDinoBboxPrecisionV1({ x_min: 0.43211, y_min: 0.20123, x_max: 0.43741, y_max: 0.20888 });
  assert.equal(box.x_min, 0.43211);
  assert.equal(box.x_max, 0.43741);
  assert.ok(box.width > 0);
  assert.ok(box.height > 0);
});

test("real crop buffer is cut from the supplied original decoded image", () => {
  const width = 10;
  const height = 10;
  const data = Buffer.alloc(width * height * 4, 255);
  const result = cropDecodedImageToPngV1({ width, height, data }, { x: 0.2, y: 0.3, width: 0.4, height: 0.2 });
  assert.ok(result?.buffer?.length > 0);
  assert.deepEqual(result.pixel_bbox, { x1: 2, y1: 3, x2: 6, y2: 5, width: 4, height: 2 });
});

test("crop-relative detections remap back into full-image coordinates", () => {
  const mapped = remapCropDetectionToFullImageV1(
    { label: "watch", confidence: 0.77, bbox: { x_min: 0.25, y_min: 0.5, x_max: 0.75, y_max: 0.9 } },
    { x: 0.4, y: 0.2, width: 0.2, height: 0.3 }
  );
  assert.equal(mapped.bbox.x_min, 0.45);
  assert.equal(mapped.bbox.y_min, 0.35);
  assert.equal(mapped.bbox.x_max, 0.55);
  assert.equal(mapped.bbox.y_max, 0.47);
  assert.equal(mapped.true_micro_crop_v1, true);
});

test("crop-relative mask geometry remaps back into full-image coordinates", () => {
  const mapped = remapCropMaskRegionToFullImageV1(
    {
      id: "sam-watch",
      coverage: 0.2,
      mask_geometry: {
        bbox: { x: 0.25, y: 0.5, w: 0.5, h: 0.4 },
        coverage: 0.2,
        bbox_area: 0.2,
        centroid_x: 0.5,
        centroid_y: 0.7,
      },
    },
    { x: 0.4, y: 0.2, width: 0.2, height: 0.3 }
  );
  assert.deepEqual(mapped.mask_geometry.bbox, { x: 0.45, y: 0.35, w: 0.1, h: 0.12 });
  assert.equal(mapped.mask_geometry.centroid_x, 0.5);
  assert.equal(mapped.mask_geometry.centroid_y, 0.41);
  assert.equal(mapped.mask_geometry.coverage, 0.012);
  assert.equal(mapped.micro_crop_mask_v1, true);
});

test("crop normalization remains bounded to image coordinates", () => {
  const crop = normalizeAccessoryCropV1({ x: 0.9, y: 0.9, width: 0.3, height: 0.3 });
  assert.equal(crop.right, 1);
  assert.equal(crop.bottom, 1);
});
