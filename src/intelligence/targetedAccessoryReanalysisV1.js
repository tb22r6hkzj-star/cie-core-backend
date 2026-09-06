const MODES = new Set(["off", "shadow", "assist"]);

const TARGETS = Object.freeze({
  chain: {
    query: ["chain necklace"],
    labels: ["chain", "chain necklace"],
    y: [0.08, 0.52],
    maxArea: 0.18,
    confidenceFloor: 0.32,
  },
  pendant: {
    query: ["pendant", "cross pendant"],
    labels: ["pendant", "cross pendant"],
    y: [0.12, 0.55],
    maxArea: 0.08,
    confidenceFloor: 0.3,
  },
  earrings: {
    query: ["earring", "stud earring", "earrings"],
    labels: ["earring", "stud earring", "earrings"],
    y: [0.02, 0.3],
    maxArea: 0.035,
    confidenceFloor: 0.28,
  },
  watch: {
    query: ["watch"],
    labels: ["watch"],
    y: [0.25, 0.78],
    maxArea: 0.08,
    confidenceFloor: 0.3,
  },
  bracelet: {
    query: ["bracelet"],
    labels: ["bracelet"],
    y: [0.25, 0.82],
    maxArea: 0.07,
    confidenceFloor: 0.28,
  },
  ring: {
    query: ["ring"],
    labels: ["ring"],
    y: [0.3, 0.88],
    maxArea: 0.025,
    confidenceFloor: 0.28,
  },
  shoe_hardware: {
    query: ["horsebit shoe hardware", "shoe hardware", "metal shoe bit"],
    labels: ["horsebit shoe hardware", "shoe hardware", "metal shoe bit"],
    y: [0.68, 1],
    maxArea: 0.06,
    confidenceFloor: 0.3,
  },
});

const DISCOVERY_TYPES = Object.freeze(["watch", "earrings"]);

function token(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

export function normalizeTargetedAccessoryReanalysisModeV1(value, fallback = "off") {
  const normalized = token(value);
  if (MODES.has(normalized)) return normalized;
  return MODES.has(token(fallback)) ? token(fallback) : "off";
}

export function resolveTargetedAccessoryReanalysisModeV1({ externalMode = "off", configuredMode = "off" } = {}) {
  const external = token(externalMode);
  const configured = normalizeTargetedAccessoryReanalysisModeV1(configuredMode);
  if (external === "off" || configured === "off") return "off";
  if (external === "shadow") return "shadow";
  return configured;
}

export function inferTargetedAccessoryTypeV1(candidate = {}) {
  const value = [candidate?.semantic_subtype, candidate?.semantic_label, candidate?.piece]
    .map(token)
    .filter(Boolean)
    .join(" ");
  if (/shoe.*(hardware|bit)|horsebit|metal.*shoe.*bit/.test(value)) return "shoe_hardware";
  if (/pendant/.test(value)) return "pendant";
  if (/chain/.test(value)) return "chain";
  if (/earring|ear_stud/.test(value)) return "earrings";
  if (/bracelet/.test(value)) return "bracelet";
  if (/watch/.test(value)) return "watch";
  if (/(^|\s|_)ring(s)?($|\s|_)/.test(value)) return "ring";
  return null;
}

function publishedAccessoryCounts(outfitAnalysis = {}) {
  const counts = {};
  for (const instance of outfitAnalysis?.accessory_instances_v1?.instances || []) {
    const type = token(instance?.accessory_type || instance?.object_type || instance?.label);
    if (!TARGETS[type]) continue;
    counts[type] = (counts[type] || 0) + 1;
  }
  return counts;
}

function publishedAccessoryTotal(outfitAnalysis = {}) {
  const direct = Number(outfitAnalysis?.accessory_instances_v1?.detected_count);
  if (Number.isFinite(direct)) return Math.max(0, direct);
  return Object.values(publishedAccessoryCounts(outfitAnalysis)).reduce((sum, value) => sum + Number(value || 0), 0);
}

/**
 * OpenAI may request targeted reanalysis, but VisionCore no longer depends on
 * OpenAI to notice every small accessory. When the primary VisionCore pass
 * publishes zero accessory instances, one bounded discovery pass is allowed
 * for the two highest-value missing small-object types: watch and earrings.
 * Existing server latency budget logic still decides whether the pass runs.
 */
export function buildTargetedAccessoryReanalysisPlanV1({
  mode = "off",
  reconciliation = {},
  outfitAnalysis = {},
  minimumSemanticConfidence = 0.9,
  maxTargets = 4,
} = {}) {
  const normalizedMode = normalizeTargetedAccessoryReanalysisModeV1(mode);
  const publishedCounts = publishedAccessoryCounts(outfitAnalysis);
  const semanticKeysByType = new Map();

  for (const candidate of reconciliation?.candidates || []) {
    const confidence = Number(candidate?.semantic_confidence || 0);
    const instanceKey = token(candidate?.instance_key);
    const action = token(candidate?.action);
    const target = inferTargetedAccessoryTypeV1(candidate);
    if (!target || confidence < minimumSemanticConfidence || !instanceKey) continue;
    if (!["support", "request_targeted_reanalysis"].includes(action)) continue;
    const keys = semanticKeysByType.get(target) || new Set();
    keys.add(instanceKey);
    semanticKeysByType.set(target, keys);
  }

  let targets = [...semanticKeysByType.entries()]
    .map(([type, keys]) => ({
      type,
      semantic_instance_count: keys.size,
      measured_instance_count: publishedCounts[type] || 0,
      missing_instance_count: Math.max(0, keys.size - (publishedCounts[type] || 0)),
      trigger_source: "openai_semantic_mismatch",
    }))
    .filter((entry) => entry.missing_instance_count > 0)
    .sort((a, b) => b.missing_instance_count - a.missing_instance_count || a.type.localeCompare(b.type))
    .slice(0, Math.max(1, Math.min(4, Number(maxTargets) || 4)));

  const semanticMismatchPresent = targets.length > 0;
  const primaryAccessoryCount = publishedAccessoryTotal(outfitAnalysis);

  if (!semanticMismatchPresent && normalizedMode !== "off" && primaryAccessoryCount === 0) {
    targets = DISCOVERY_TYPES.map((type) => ({
      type,
      semantic_instance_count: 0,
      measured_instance_count: 0,
      missing_instance_count: 1,
      trigger_source: "visioncore_zero_accessory_discovery",
    }));
  }

  const queryTerms = targets.flatMap((entry) => TARGETS[entry.type].query);
  const discoveryTriggered = !semanticMismatchPresent && targets.some((entry) => entry.trigger_source === "visioncore_zero_accessory_discovery");

  return {
    version: "targeted_accessory_reanalysis_v1",
    mode: normalizedMode,
    authority_owner: "visioncore",
    external_color_authority: false,
    publication_allowed: normalizedMode === "assist",
    execution_allowed: normalizedMode !== "off" && targets.length > 0,
    detector_pass_budget: 1,
    discovery_sweep_v1: discoveryTriggered,
    trigger_source: semanticMismatchPresent ? "openai_semantic_mismatch" : discoveryTriggered ? "visioncore_zero_accessory_discovery" : "none",
    targets,
    query: queryTerms.length ? `${queryTerms.join(". ")}.` : null,
    reason: semanticMismatchPresent
      ? "semantic_instance_count_exceeds_measured_visioncore_instances"
      : discoveryTriggered
        ? "visioncore_primary_pass_published_zero_accessories"
        : "no_eligible_instance_mismatch",
  };
}

function normalizedBox(bbox = {}, imageDimensions = {}) {
  const x1 = Number(bbox?.x_min ?? bbox?.x ?? bbox?.left);
  const y1 = Number(bbox?.y_min ?? bbox?.y ?? bbox?.top);
  const x2 = Number(bbox?.x_max ?? bbox?.x2 ?? (x1 + Number(bbox?.width ?? bbox?.w)));
  const y2 = Number(bbox?.y_max ?? bbox?.y2 ?? (y1 + Number(bbox?.height ?? bbox?.h)));
  if (![x1, y1, x2, y2].every(Number.isFinite)) return null;
  const unit = x1 >= 0 && y1 >= 0 && x2 <= 1 && y2 <= 1;
  const imageWidth = Number(imageDimensions?.width || 0);
  const imageHeight = Number(imageDimensions?.height || 0);
  if (!unit && (!(imageWidth > 0) || !(imageHeight > 0))) return null;
  const nx1 = unit ? x1 : x1 / imageWidth;
  const ny1 = unit ? y1 : y1 / imageHeight;
  const nx2 = unit ? x2 : x2 / imageWidth;
  const ny2 = unit ? y2 : y2 / imageHeight;
  if (nx1 < 0 || ny1 < 0 || nx2 > 1 || ny2 > 1 || nx2 <= nx1 || ny2 <= ny1) return null;
  return { x1: nx1, y1: ny1, x2: nx2, y2: ny2, area: (nx2 - nx1) * (ny2 - ny1), centerY: (ny1 + ny2) / 2 };
}

function detectionTarget(label, plannedTypes) {
  const normalized = String(label || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return plannedTypes.find((type) => TARGETS[type].labels.some((allowed) => normalized === allowed || normalized.includes(allowed))) || null;
}

export function filterTargetedAccessoryDetectionsV1({ plan = {}, detections = [], imageDimensions = {} } = {}) {
  const plannedTypes = (plan?.targets || []).map((target) => target.type).filter((type) => TARGETS[type]);
  const accepted = [];
  const rejected = [];
  for (const detection of detections || []) {
    const type = detectionTarget(detection?.label, plannedTypes);
    const box = normalizedBox(detection?.bbox, imageDimensions);
    const config = type ? TARGETS[type] : null;
    let reason = null;
    if (!type) reason = "label_not_in_allowlisted_plan";
    else if (!box) reason = "bbox_not_normalized_or_invalid";
    else if (Number(detection?.confidence || 0) < config.confidenceFloor) reason = "detector_confidence_below_floor";
    else if (box.centerY < config.y[0] || box.centerY > config.y[1]) reason = "outside_expected_body_region";
    else if (box.area > config.maxArea) reason = "bbox_too_large_for_small_object";
    if (reason) rejected.push({ ...detection, targeted_type: type, rejection_reason: reason });
    else accepted.push({
      ...detection,
      bbox: {
        x_min: box.x1,
        y_min: box.y1,
        x_max: box.x2,
        y_max: box.y2,
        width: box.x2 - box.x1,
        height: box.y2 - box.y1,
      },
      targeted_type: type,
      label: type === "shoe_hardware" ? "shoe hardware" : type === "earrings" ? "earrings" : type,
    });
  }
  return {
    version: "targeted_accessory_detection_filter_v1",
    authority_owner: "visioncore",
    accepted,
    rejected,
  };
}
