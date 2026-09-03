from pathlib import Path

path = Path("src/server.js")
source = path.read_text()

runtime_import = 'import { createTransformLatencyBudgetV1, shouldRunAccessoryEscalationV1 } from "./intelligence/transformLatencyBudgetV1.js";\n'
import_anchor = 'import { buildConsumerEvidenceV1 } from "./intelligence/consumerEvidenceV1.js";\n'
if runtime_import not in source:
    if import_anchor not in source:
        raise SystemExit("latency budget import anchor not found")
    source = source.replace(import_anchor, import_anchor + runtime_import, 1)

source = source.replace('const PIXELCUT_TIMEOUT_MS = 45000;', 'const PIXELCUT_TIMEOUT_MS = 18000;', 1)

old_sig = 'async function callPixelcutRemoveBg(imageUrl) {'
new_sig = 'async function callPixelcutRemoveBg(imageUrl, timeoutMs = PIXELCUT_TIMEOUT_MS) {'
if new_sig not in source:
    if old_sig not in source:
        raise SystemExit("pixelcut function signature not found")
    source = source.replace(old_sig, new_sig, 1)
source = source.replace('  const timeout = setTimeout(() => controller.abort(), PIXELCUT_TIMEOUT_MS);', '  const timeout = setTimeout(() => controller.abort(), Math.max(3000, Math.min(PIXELCUT_TIMEOUT_MS, Number(timeoutMs) || PIXELCUT_TIMEOUT_MS)));', 1)

# Start SAM in parallel with normal DINO work.
sam_old = '''  const configuredSingleQuery = String(process.env.GROUNDING_DINO_QUERY || "").trim();
  const groundingPasses = configuredSingleQuery
'''
sam_new = '''  const samPromise = runSamSegmentation(ghostUrl);
  const configuredSingleQuery = String(process.env.GROUNDING_DINO_QUERY || "").trim();
  const groundingPasses = configuredSingleQuery
'''
if sam_new not in source:
    if sam_old not in source:
        raise SystemExit("DINO/SAM parallelization anchor not found")
    source = source.replace(sam_old, sam_new, 1)
source = source.replace('  const sam = await runSamSegmentation(ghostUrl);', '  const sam = await samPromise;', 1)

route_old = '''app.post("/api/images/transform", upload.any(), async (req, res) => {
  try {
    const files = Array.isArray(req.files) ? req.files : [];
'''
route_new = '''app.post("/api/images/transform", upload.any(), async (req, res) => {
  const transformLatencyBudget = createTransformLatencyBudgetV1({
    totalMs: Number(process.env.VISIONCORE_TRANSFORM_BUDGET_MS) || 50000,
    reserveMs: Number(process.env.VISIONCORE_TRANSFORM_RESPONSE_RESERVE_MS) || 5000,
  });
  try {
    const files = Array.isArray(req.files) ? req.files : [];
'''
if route_new not in source:
    if route_old not in source:
        raise SystemExit("transform route anchor not found")
    source = source.replace(route_old, route_new, 1)

pixelcut_call_old = '      ghostUrl = await callPixelcutRemoveBg(publicUrl);'
pixelcut_call_new = '''      ghostUrl = await callPixelcutRemoveBg(
        publicUrl,
        transformLatencyBudget.providerTimeoutMs({ requestedMs: PIXELCUT_TIMEOUT_MS, maximumMs: 18000 })
      );'''
if pixelcut_call_new not in source:
    if pixelcut_call_old not in source:
        raise SystemExit("pixelcut route call not found")
    source = source.replace(pixelcut_call_old, pixelcut_call_new, 1)

external_mode_old = '''    const effectiveExternalIntelligenceMode = captureQuality?.disposition === "retake"
      ? "off"
      : EXTERNAL_INTELLIGENCE_MODE;
'''
external_mode_new = '''    const effectiveExternalIntelligenceMode = captureQuality?.disposition === "retake" || !transformLatencyBudget.canRun(8000)
      ? "off"
      : EXTERNAL_INTELLIGENCE_MODE;
'''
if external_mode_new not in source:
    if external_mode_old not in source:
        raise SystemExit("external intelligence mode anchor not found")
    source = source.replace(external_mode_old, external_mode_new, 1)

semantic_call_anchor = '''      model: OPENAI_SEMANTIC_MODEL,
      cache: externalSemanticCache,
'''
semantic_call_new = '''      model: OPENAI_SEMANTIC_MODEL,
      timeoutMs: transformLatencyBudget.providerTimeoutMs({ requestedMs: 8000, maximumMs: 8000 }),
      cache: externalSemanticCache,
'''
if semantic_call_new not in source:
    if semantic_call_anchor not in source:
        raise SystemExit("semantic timeout anchor not found")
    source = source.replace(semantic_call_anchor, semantic_call_new, 1)

target_if_old = '    if (targetedAccessoryReanalysis.execution_allowed && targetedAccessoryReanalysis.query) {'
target_guard = '''    if (
      targetedAccessoryReanalysis.execution_allowed &&
      targetedAccessoryReanalysis.query &&
      !shouldRunAccessoryEscalationV1(transformLatencyBudget, 10000)
    ) {
      targetedAccessoryReanalysis = {
        ...targetedAccessoryReanalysis,
        execution_allowed: false,
        latency_budget_skipped: true,
        reason: "transform_latency_budget_insufficient_for_optional_accessory_reanalysis",
      };
    }
    if (targetedAccessoryReanalysis.execution_allowed && targetedAccessoryReanalysis.query) {'''
if target_guard not in source:
    if target_if_old not in source:
        raise SystemExit("targeted accessory execution anchor not found")
    source = source.replace(target_if_old, target_guard, 1)

pipeline_anchor = '''        pipeline: {
          ...analysis.pipeline,
          lower_sampling_version: LOWER_SAMPLING_VERSION,
        },
'''
pipeline_new = '''        pipeline: {
          ...analysis.pipeline,
          lower_sampling_version: LOWER_SAMPLING_VERSION,
          transform_latency_budget_v1: transformLatencyBudget.snapshot("response"),
        },
'''
if pipeline_new not in source:
    if pipeline_anchor not in source:
        raise SystemExit("debug pipeline anchor not found")
    source = source.replace(pipeline_anchor, pipeline_new, 1)

path.write_text(source)
print("wired transform latency budget V1 into live transform")
