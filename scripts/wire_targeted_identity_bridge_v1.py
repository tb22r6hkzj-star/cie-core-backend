from pathlib import Path

server_path = Path("src/server.js")
server = server_path.read_text()

old_micro = '''        } else if (accessoryMicroCropRuntime?.locator?.skipped !== true) {\n          targetedAcceptedDetections = targetedAcceptedDetections.filter((detection) =>\n            !microCropLabelMatches(detection, accessoryMicroCropTarget)\n          );\n        }\n'''
new_micro = '''        } else if (accessoryMicroCropRuntime?.locator?.skipped !== true) {\n          // Identity-first doctrine: a failed refinement pass cannot erase an\n          // already accepted full-image VisionCore spatial detection. Keep the\n          // detection for identity publication; downstream mask/color gates\n          // still decide whether any color authority can be published.\n          accessoryMicroCropRuntime = {\n            ...accessoryMicroCropRuntime,\n            identity_fallback_preserved: targetedAcceptedDetections.some((detection) =>\n              microCropLabelMatches(detection, accessoryMicroCropTarget)\n            ),\n          };\n        }\n'''
if new_micro not in server:
    if old_micro not in server:
        raise SystemExit("targeted micro-crop fallback anchor missing")
    server = server.replace(old_micro, new_micro, 1)
server_path.write_text(server)

v6_path = Path("src/intelligence/perceptionV6/index.js")
v6 = v6_path.read_text()
old_base = '    const base = { id: region.id ?? `region-${index}`, source: region.source_type ?? "segmentation", zone: region.zone ?? "unknown", label: region.segment_label ?? region.label ?? region.category ?? "unknown", confidence, geometry };\n'
new_base = '    const base = { id: region.id ?? `region-${index}`, source: region.source_type ?? "segmentation", zone: region.zone ?? "unknown", label: region.segment_label ?? region.label ?? region.category ?? "unknown", confidence, geometry, targeted_reanalysis_v1: region?.targeted_reanalysis_v1 === true, targeted_accessory_reanalysis_v1: region?.targeted_accessory_reanalysis_v1 === true };\n'
if new_base not in v6:
    if old_base not in v6:
        raise SystemExit("Perception V6 evidence base anchor missing")
    v6 = v6.replace(old_base, new_base, 1)
v6_path.write_text(v6)

print("wired targeted identity provenance and non-destructive micro-crop fallback")
