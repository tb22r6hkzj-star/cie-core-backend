from pathlib import Path

path = Path("src/server.js")
source = path.read_text()

import_anchor = 'import { createTransformLatencyBudgetV1, shouldRunAccessoryEscalationV1 } from "./intelligence/transformLatencyBudgetV1.js";\n'
import_line = 'import { buildGroundingDinoQueryPlanV1 } from "./intelligence/groundingDinoQueryPlanV1.js";\n'
if import_line not in source:
    if import_anchor not in source:
        raise SystemExit("GroundingDINO query plan import anchor missing")
    source = source.replace(import_anchor, import_anchor + import_line, 1)

old = '''  const configuredSingleQuery = String(process.env.GROUNDING_DINO_QUERY || "").trim();\n  const groundingPasses = configuredSingleQuery\n    ? [await runGroundingDinoDetection(ghostUrl, configuredSingleQuery)]\n    : await Promise.all([\n      runGroundingDinoDetection(ghostUrl, DEFAULT_GROUNDING_DINO_GARMENT_QUERY),\n      runGroundingDinoDetection(ghostUrl, DEFAULT_GROUNDING_DINO_ACCESSORY_QUERY),\n    ]);\n'''
new = '''  const configuredSingleQuery = String(process.env.GROUNDING_DINO_QUERY || "").trim();\n  const groundingQueryPlan = buildGroundingDinoQueryPlanV1({\n    configuredPrimaryQuery: configuredSingleQuery,\n    defaultGarmentQuery: DEFAULT_GROUNDING_DINO_GARMENT_QUERY,\n    accessoryQuery: DEFAULT_GROUNDING_DINO_ACCESSORY_QUERY,\n  });\n  const groundingPasses = await Promise.all(\n    groundingQueryPlan.queries.map((query) => runGroundingDinoDetection(ghostUrl, query))\n  );\n'''
if new not in source:
    if old not in source:
        raise SystemExit("GroundingDINO pass selection anchor missing")
    source = source.replace(old, new, 1)

path.write_text(source)
print("wired GroundingDINO query plan V1")
