from pathlib import Path

path = Path("src/server.js")
source = path.read_text()

import_anchor = 'import { buildGroundingDinoQueryPlanV1 } from "./intelligence/groundingDinoQueryPlanV1.js";\n'
import_block = '''import {\n  cropDecodedImageToPngV1,\n  normalizeDinoBboxPrecisionV1,\n  remapCropDetectionToFullImageV1,\n} from "./intelligence/accessoryTrueMicroCropV1.js";\n'''
if import_block not in source:
    if import_anchor not in source:
        raise SystemExit("micro-crop import anchor missing")
    source = source.replace(import_anchor, import_anchor + import_block, 1)

old_normalize = '''function normalizeGroundingDinoBbox(rawBbox) {\n  let values = null;\n  if (Array.isArray(rawBbox)) {\n    values = rawBbox.slice(0, 4).map(Number);\n  } else if (rawBbox && typeof rawBbox === "object") {\n    const x1 = rawBbox.x_min ?? rawBbox.xmin ?? rawBbox.left ?? rawBbox.x1 ?? rawBbox.x;\n    const y1 = rawBbox.y_min ?? rawBbox.ymin ?? rawBbox.top ?? rawBbox.y1 ?? rawBbox.y;\n    const x2 = rawBbox.x_max ?? rawBbox.xmax ?? rawBbox.right ?? rawBbox.x2;\n    const y2 = rawBbox.y_max ?? rawBbox.ymax ?? rawBbox.bottom ?? rawBbox.y2;\n    const w = rawBbox.width ?? rawBbox.w;\n    const h = rawBbox.height ?? rawBbox.h;\n    values = [Number(x1), Number(y1), Number(x2 ?? Number(x1) + Number(w)), Number(y2 ?? Number(y1) + Number(h))];\n  }\n\n  if (!values || values.some((value) => !Number.isFinite(value))) return null;\n  let [x1, y1, x2, y2] = values;\n  if (x2 < x1) [x1, x2] = [x2, x1];\n  if (y2 < y1) [y1, y2] = [y2, y1];\n\n  return {\n    x_min: round2(x1),\n    y_min: round2(y1),\n    x_max: round2(x2),\n    y_max: round2(y2),\n    width: round2(Math.max(0, x2 - x1)),\n    height: round2(Math.max(0, y2 - y1)),\n  };\n}\n'''
new_normalize = '''function normalizeGroundingDinoBbox(rawBbox) {\n  // Preserve tiny watch/earring geometry. Two-decimal rounding can collapse\n  // small normalized boxes before they ever reach VisionCore mapping.\n  return normalizeDinoBboxPrecisionV1(rawBbox);\n}\n'''
if new_normalize not in source:
    if old_normalize not in source:
        raise SystemExit("normalizeGroundingDinoBbox anchor missing")
    source = source.replace(old_normalize, new_normalize, 1)

upload_anchor = '''async function callPixelcutRemoveBg(imageUrl, timeoutMs = PIXELCUT_TIMEOUT_MS) {\n'''
helper = '''async function createAccessoryMicroCropImageUrlV1(imageUrl, crop, targetType = "accessory") {\n  try {\n    const originalBuffer = await fetchImageBuffer(imageUrl);\n    const decodedOriginal = decodeImageRgba(originalBuffer, imageUrl);\n    const artifact = cropDecodedImageToPngV1(decodedOriginal, crop);\n    if (!artifact?.buffer?.length) {\n      return { ok: false, reason: "micro_crop_buffer_unavailable", url: null };\n    }\n    const dataUri = `data:image/png;base64,${artifact.buffer.toString("base64")}`;\n    const uploaded = await cloudinary.uploader.upload(dataUri, {\n      folder: "cie/accessory-micro-crops",\n      resource_type: "image",\n    });\n    if (!uploaded?.secure_url) {\n      return { ok: false, reason: "micro_crop_upload_missing_url", url: null };\n    }\n    return {\n      ok: true,\n      url: uploaded.secure_url,\n      crop: artifact.crop,\n      pixel_bbox: artifact.pixel_bbox,\n      target_type: targetType,\n      source: "original_upload_true_crop",\n    };\n  } catch (error) {\n    return {\n      ok: false,\n      reason: error?.message || "micro_crop_creation_failed",\n      url: null,\n      target_type: targetType,\n      source: "original_upload_true_crop",\n    };\n  }\n}\n\n'''
if helper not in source:
    if upload_anchor not in source:
        raise SystemExit("Pixelcut anchor missing for crop helper")
    source = source.replace(upload_anchor, helper + upload_anchor, 1)

old_detector = '''          runDetector: async () => runGroundingDinoDetection(ghostUrl, microQuery),\n'''
new_detector = '''          runDetector: async ({ imageUrl: sourceImageUrl, crop }) => {\n            const cropArtifact = await createAccessoryMicroCropImageUrlV1(\n              sourceImageUrl,\n              crop,\n              accessoryMicroCropTarget\n            );\n            if (!cropArtifact?.ok || !cropArtifact?.url) {\n              return {\n                enabled: true,\n                ok: false,\n                reason: cropArtifact?.reason || "true_micro_crop_creation_failed",\n                detections: [],\n                true_micro_crop_v1: cropArtifact,\n              };\n            }\n            const detected = await runGroundingDinoDetection(cropArtifact.url, microQuery);\n            const remappedDetections = (detected?.detections || [])\n              .map((detection) => remapCropDetectionToFullImageV1(detection, cropArtifact.crop))\n              .filter(Boolean);\n            return {\n              ...detected,\n              ok: remappedDetections.length > 0,\n              detections: remappedDetections,\n              true_micro_crop_v1: {\n                ok: true,\n                source: cropArtifact.source,\n                target_type: cropArtifact.target_type,\n                crop: cropArtifact.crop,\n                pixel_bbox: cropArtifact.pixel_bbox,\n                detector_input: "physical_original_image_crop",\n                remapped_detection_count: remappedDetections.length,\n              },\n            };\n          },\n'''
if new_detector not in source:
    if old_detector not in source:
        raise SystemExit("micro-crop detector callback anchor missing")
    source = source.replace(old_detector, new_detector, 1)

path.write_text(source)
print("wired true accessory micro-crop V1")
