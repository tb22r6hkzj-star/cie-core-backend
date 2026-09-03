from pathlib import Path

path = Path("src/server.js")
source = path.read_text()

runtime_import = 'import { buildAccessoryIntelligenceLaneV1 } from "./intelligence/accessoryIntelligenceLaneV1.js";\n'
import_anchor = '} from "./intelligence/targetedAccessoryReanalysisV1.js";\n'
if runtime_import not in source:
    if import_anchor not in source:
        raise SystemExit("targeted accessory import anchor not found")
    source = source.replace(import_anchor, import_anchor + runtime_import, 1)

old = '''    let targetedAccessoryReanalysis = buildTargetedAccessoryReanalysisPlanV1({
      mode: resolveTargetedAccessoryReanalysisModeV1({
        externalMode: effectiveExternalIntelligenceMode,
        configuredMode: TARGETED_ACCESSORY_REANALYSIS_MODE,
      }),
      reconciliation: semanticReconciliation,
      outfitAnalysis,
    });
'''
new = '''    let accessoryIntelligenceLane = buildAccessoryIntelligenceLaneV1({
      outfitAnalysis,
      reconciliation: semanticReconciliation,
    });
    let targetedAccessoryReanalysis = buildTargetedAccessoryReanalysisPlanV1({
      mode: resolveTargetedAccessoryReanalysisModeV1({
        externalMode: effectiveExternalIntelligenceMode,
        configuredMode: TARGETED_ACCESSORY_REANALYSIS_MODE,
      }),
      reconciliation: semanticReconciliation,
      outfitAnalysis,
    });
    const forcedAccessoryTargets = (accessoryIntelligenceLane?.forced_micro_crop_targets || [])
      .filter((type) => ["watch", "earrings"].includes(type));
    if (forcedAccessoryTargets.length && targetedAccessoryReanalysis?.mode === "assist") {
      const existingTargetTypes = new Set((targetedAccessoryReanalysis?.targets || []).map((target) => target?.type));
      const forcedTargets = forcedAccessoryTargets
        .filter((type) => !existingTargetTypes.has(type))
        .map((type) => ({
          type,
          semantic_instance_count: 1,
          measured_instance_count: 1,
          missing_instance_count: 0,
          forced_by_accessory_intelligence_lane: true,
        }));
      const forcedQueries = forcedAccessoryTargets.flatMap((type) =>
        type === "watch" ? ["watch"] : ["earring", "stud earring", "earrings"]
      );
      const existingQuery = String(targetedAccessoryReanalysis?.query || "").trim();
      const forcedQuery = forcedQueries.length ? `${forcedQueries.join(". ")}.` : "";
      targetedAccessoryReanalysis = {
        ...targetedAccessoryReanalysis,
        execution_allowed: true,
        publication_allowed: true,
        targets: [...(targetedAccessoryReanalysis?.targets || []), ...forcedTargets],
        query: [existingQuery, forcedQuery].filter(Boolean).join(" "),
        reason: "accessory_color_challenge_requires_remeasurement",
        accessory_intelligence_lane_trigger_v1: accessoryIntelligenceLane,
      };
    }
'''
if new not in source:
    if old not in source:
        raise SystemExit("targeted accessory planning anchor not found")
    source = source.replace(old, new, 1)

reconcile_anchor = '''        semanticReconciliation = reconcileExternalSemanticsV1({
          handoff: externalSemantic?.handoff,
          outfitAnalysis,
        });
        const nextAccessoryInstances = outfitAnalysis?.accessory_instances_v1?.instances || [];
'''
reconcile_new = '''        semanticReconciliation = reconcileExternalSemanticsV1({
          handoff: externalSemantic?.handoff,
          outfitAnalysis,
        });
        accessoryIntelligenceLane = buildAccessoryIntelligenceLaneV1({
          outfitAnalysis,
          reconciliation: semanticReconciliation,
        });
        const nextAccessoryInstances = outfitAnalysis?.accessory_instances_v1?.instances || [];
'''
if reconcile_new not in source:
    if reconcile_anchor not in source:
        raise SystemExit("post remeasurement reconciliation anchor not found")
    source = source.replace(reconcile_anchor, reconcile_new, 1)

debug_anchor = '''          semantic_reconciliation: semanticReconciliation,
          targeted_accessory_reanalysis: targetedAccessoryReanalysis,
'''
debug_new = '''          semantic_reconciliation: semanticReconciliation,
          accessory_intelligence_lane: accessoryIntelligenceLane,
          targeted_accessory_reanalysis: targetedAccessoryReanalysis,
'''
if debug_new not in source:
    if debug_anchor not in source:
        raise SystemExit("external intelligence debug anchor not found")
    source = source.replace(debug_anchor, debug_new, 1)

path.write_text(source)
print("wired Accessory Intelligence Lane V1 into live transform")
