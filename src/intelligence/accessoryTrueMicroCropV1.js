import { PNG } from "pngjs";

const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));
const round6 = (value) => Math.round(Number(value || 0) * 1e6) / 1e6;

export function normalizeDinoBboxPrecisionV1(rawBbox = null) {
  let values = null;
  if (Array.isArray(rawBbox)) {
    values = rawBbox.slice(0, 4).map(Number);
  } else if (rawBbox && typeof rawBbox === "object") {
    const x1 = rawBbox.x_min ?? rawBbox.xmin ?? rawBbox.left ?? rawBbox.x1 ?? rawBbox.x;
    const y1 = rawBbox.y_min ?? rawBbox.ymin ?? rawBbox.top ?? rawBbox.y1 ?? rawBbox.y;
    const x2 = rawBbox.x_max ?? rawBbox.xmax ?? rawBbox.right ?? rawBbox.x2;
    const y2 = rawBbox.y_max ?? rawBbox.ymax ?? rawBbox.bottom ?? rawBbox.y2;
    const w = rawBbox.width ?? rawBbox.w;
    const h = rawBbox.height ?? rawBbox.h;
    values = [
      Number(x1),
      Number(y1),
      Number(x2 ?? Number(x1) + Number(w)),
      Number(y2 ?? Number(y1) + Number(h)),
    ];
  }
  if (!values || values.some((value) => !Number.isFinite(value))) return null;
  let [x1, y1, x2, y2] = values;
  if (x2 < x1) [x1, x2] = [x2, x1];
  if (y2 < y1) [y1, y2] = [y2, y1];
  return {
    x_min: round6(x1),
    y_min: round6(y1),
    x_max: round6(x2),
    y_max: round6(y2),
    width: round6(Math.max(0, x2 - x1)),
    height: round6(Math.max(0, y2 - y1)),
  };
}

export function normalizeAccessoryCropV1(crop = {}) {
  const x = clamp01(crop?.x ?? crop?.x_min ?? crop?.left);
  const y = clamp01(crop?.y ?? crop?.y_min ?? crop?.top);
  const width = Number(crop?.width ?? crop?.w ?? 0);
  const height = Number(crop?.height ?? crop?.h ?? 0);
  const right = clamp01(crop?.right ?? crop?.x_max ?? (x + width));
  const bottom = clamp01(crop?.bottom ?? crop?.y_max ?? (y + height));
  if (![x, y, right, bottom].every(Number.isFinite) || right <= x || bottom <= y) return null;
  return {
    x: round6(x),
    y: round6(y),
    width: round6(right - x),
    height: round6(bottom - y),
    right: round6(right),
    bottom: round6(bottom),
  };
}

export function cropDecodedImageToPngV1(decodedImage = {}, crop = {}) {
  const normalized = normalizeAccessoryCropV1(crop);
  const width = Number(decodedImage?.width || 0);
  const height = Number(decodedImage?.height || 0);
  const data = decodedImage?.data;
  if (!normalized || !width || !height || !data) return null;
  const x1 = Math.max(0, Math.min(width - 1, Math.floor(normalized.x * width)));
  const y1 = Math.max(0, Math.min(height - 1, Math.floor(normalized.y * height)));
  const x2 = Math.max(x1 + 1, Math.min(width, Math.ceil(normalized.right * width)));
  const y2 = Math.max(y1 + 1, Math.min(height, Math.ceil(normalized.bottom * height)));
  const cropWidth = x2 - x1;
  const cropHeight = y2 - y1;
  const png = new PNG({ width: cropWidth, height: cropHeight });
  for (let y = 0; y < cropHeight; y += 1) {
    for (let x = 0; x < cropWidth; x += 1) {
      const src = ((y1 + y) * width + (x1 + x)) * 4;
      const dst = (y * cropWidth + x) * 4;
      png.data[dst] = data[src];
      png.data[dst + 1] = data[src + 1];
      png.data[dst + 2] = data[src + 2];
      png.data[dst + 3] = data[src + 3];
    }
  }
  return {
    buffer: PNG.sync.write(png),
    crop: normalized,
    pixel_bbox: { x1, y1, x2, y2, width: cropWidth, height: cropHeight },
  };
}

export function remapCropDetectionToFullImageV1(detection = {}, crop = {}) {
  const normalizedCrop = normalizeAccessoryCropV1(crop);
  const bbox = normalizeDinoBboxPrecisionV1(detection?.bbox || detection?.bounding_box || detection);
  if (!normalizedCrop || !bbox) return null;
  const mapped = normalizeDinoBboxPrecisionV1({
    x_min: normalizedCrop.x + bbox.x_min * normalizedCrop.width,
    y_min: normalizedCrop.y + bbox.y_min * normalizedCrop.height,
    x_max: normalizedCrop.x + bbox.x_max * normalizedCrop.width,
    y_max: normalizedCrop.y + bbox.y_max * normalizedCrop.height,
  });
  if (!mapped || mapped.width <= 0 || mapped.height <= 0) return null;
  return {
    ...detection,
    bbox: mapped,
    true_micro_crop_v1: true,
    crop_relative_bbox: bbox,
  };
}
