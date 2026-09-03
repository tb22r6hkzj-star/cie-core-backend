from pathlib import Path

path = Path("src/server.js")
source = path.read_text()

runtime_import = 'import { executeAccessoryMicroCropRuntimeV1 } from "./intelligence/accessoryMicroCropRuntimeV1.js";\n'
import_anchor = '} from "./intelligence/targetedAccessoryReanalysisV1.js";\n'
if runtime_import not in source:
    if import_anchor not in source:
        raise SystemExit("targeted accessory import anchor not found")
    source = source.replace(import_anchor, import_anchor + runtime_import, 1)

old = '''      const targetedFilter = filterTargetedAccessoryDetectionsV1({
        plan: targetedAccessoryReanalysis,
        detections: targetedDetector?.detections || [],
      });
      let targetedRegions = buildDinoSegmentedRegions(targetedFilter.accepted)
'''
new = '''      const targetedFilter = filterTargetedAccessoryDetectionsV1({
        plan: targetedAccessoryReanalysis,
        detections: targetedDetector?.detections || [],
      });
      let targetedAcceptedDetections = targetedFilter.accepted;
      let accessoryMicroCropRuntime = null;
      let accessoryMicroCropTarget = null;
      const plannedMicroCropTypes = (targetedAccessoryReanalysis?.targets || [])
        .map((target) => String(target?.type || "").trim().toLowerCase());
      accessoryMicroCropTarget = plannedMicroCropTypes.includes("watch")
        ? "watch"
        : plannedMicroCropTypes.includes("earrings")
          ? "earrings"
          : null;

      const microCropLabelMatches = (detection, targetType) => {
        const label = String(detection?.label || detection?.category || "").trim().toLowerCase();
        if (targetType === "watch") return /watch/.test(label);
        if (targetType === "earrings") return /earring|ear stud|stud earring/.test(label);
        return false;
      };

      if (accessoryMicroCropTarget && targetedAccessoryReanalysis.publication_allowed) {
        const detectorCandidate = targetedAcceptedDetections.find((detection) =>
          microCropLabelMatches(detection, accessoryMicroCropTarget)
        );
        const rawDetectorBox = detectorCandidate?.bbox || null;
        let detectorBox = null;
        if (rawDetectorBox) {
          const x = Number(rawDetectorBox?.x ?? rawDetectorBox?.x_min ?? rawDetectorBox?.left);
          const y = Number(rawDetectorBox?.y ?? rawDetectorBox?.y_min ?? rawDetectorBox?.top);
          const right = Number(rawDetectorBox?.right ?? rawDetectorBox?.x_max ?? (x + Number(rawDetectorBox?.width ?? rawDetectorBox?.w)));
          const bottom = Number(rawDetectorBox?.bottom ?? rawDetectorBox?.y_max ?? (y + Number(rawDetectorBox?.height ?? rawDetectorBox?.h)));
          if ([x, y, right, bottom].every(Number.isFinite) && x >= 0 && y >= 0 && right <= 1 && bottom <= 1 && right > x && bottom > y) {
            detectorBox = { x, y, width: right - x, height: bottom - y };
          }
        }
        const microQuery = accessoryMicroCropTarget === "watch"
          ? "watch."
          : "earring. stud earring. earrings.";
        accessoryMicroCropRuntime = await executeAccessoryMicroCropRuntimeV1({
          imageUrl: publicUrl,
          targetType: accessoryMicroCropTarget,
          detectorBox,
          runDetector: async () => runGroundingDinoDetection(ghostUrl, microQuery),
        });
        const microCropSucceeded = Boolean(
          accessoryMicroCropRuntime?.ok &&
          !accessoryMicroCropRuntime?.skipped &&
          accessoryMicroCropRuntime?.clipped_detections?.length
        );
        if (microCropSucceeded) {
          targetedAcceptedDetections = [
            ...targetedAcceptedDetections.filter((detection) =>
              !microCropLabelMatches(detection, accessoryMicroCropTarget)
            ),
            ...accessoryMicroCropRuntime.clipped_detections,
          ];
        } else if (accessoryMicroCropRuntime?.locator?.skipped !== true) {
          targetedAcceptedDetections = targetedAcceptedDetections.filter((detection) =>
            !microCropLabelMatches(detection, accessoryMicroCropTarget)
          );
        }
      }

      let targetedRegions = buildDinoSegmentedRegions(targetedAcceptedDetections)
'''
if new not in source:
    if old not in source:
        raise SystemExit("targeted reanalysis insertion anchor not found")
    source = source.replace(old, new, 1)

source = source.replace(
    '        accepted_detection_count: targetedFilter.accepted.length,\n',
    '        accepted_detection_count: targetedAcceptedDetections.length,\n',
    1,
)
source = source.replace(
    '        accepted_detections: targetedFilter.accepted,\n',
    '        accepted_detections: targetedAcceptedDetections,\n',
    1,
)
metrics_anchor = '        rejected_detections: targetedFilter.rejected,\n        measured_regions: targetedRegions,\n'
metrics_new = '''        rejected_detections: targetedFilter.rejected,
        accessory_micro_crop_runtime_v1: accessoryMicroCropRuntime,
        accessory_micro_crop_target: accessoryMicroCropTarget,
        accessory_micro_crop_applied: Boolean(
          accessoryMicroCropRuntime?.ok &&
          !accessoryMicroCropRuntime?.skipped &&
          accessoryMicroCropRuntime?.clipped_detections?.length
        ),
        measured_regions: targetedRegions,
'''
if metrics_new not in source:
    if metrics_anchor not in source:
        raise SystemExit("targeted metrics anchor not found")
    source = source.replace(metrics_anchor, metrics_new, 1)

path.write_text(source)
print("wired accessory micro crop runtime into live targeted reanalysis")
