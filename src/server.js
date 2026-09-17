Warning: truncated output (original token count: 96658)
Total output lines: 9685

// src/server.js
// FULL REWRITE — VisionCore backend
//
// ROUTES
// ✅ GET  /
// ✅ GET  /health
// ✅ GET  /api/debug/status
// ✅ POST /api/images/transform
// ✅ POST /api/recommendations
// ✅ POST /api/retrieval/preview
//
// FEATURES
// ✅ Multer-hardened uploads
// ✅ Cloudinary upload + color analysis
// ✅ Pixelcut background removal with timeout handling
// ✅ V2 palette engine
// ✅ Outfit scoring
// ✅ Style identity system
// ✅ Mode-aware suggested adjustments
// ✅ Retrieval intent
// ✅ Shopping assist
// ✅ Human color naming across ALL surfaced colors
// ✅ Premium / luxury naming vocabulary
// ✅ Step-based errors
// ✅ LAB / perceptual intelligence layer added safely
// ✅ Visual importance layer added safely
// ✅ Structural Color Intelligence (SCI) added safely
//
// REQUIRED ENV
// - CLOUDINARY_CLOUD_NAME
// - CLOUDINARY_API_KEY
// - CLOUDINARY_API_SECRET
// - PIXELCUT_API_KEY
// - PIXELCUT_ENDPOINT
// - AMAZON_PARTNER_TAG (optional)

import "./intelligence/liveServerTelemetryPreloadV1.js";
import express from "express";
import cors from "cors";
import multer from "multer";
import dotenv from "dotenv";
import { v2 as cloudinary } from "cloudinary";
import chroma from "chroma-js";
import jpeg from "jpeg-js";
import { PNG } from "pngjs";
import { analyzePerceptionV5 } from "./intelligence/perceptionV5/index.js";
import { analyzePerceptionV6 } from "./intelligence/perceptionV6/index.js";
import { buildAccessoryInstancesV1 } from "./intelligence/accessoryInstancesV1.js";
import { attachColorEvidenceToZones } from "./intelligence/colorEvidence/index.js";
import { applyPieceColorOwnershipV1 } from "./intelligence/pieceColorOwnershipV1.js";
import { buildTargetConditionedSegmentationPlanV1 } from "./intelligence/semanticMaskOrchestrationV1.js";
import {
  bindEarlySegmentationToFinalPlanV1,
  mergeTargetConditionedSegmentationsV1,
  segmentationPlanBindingEnabledV1,
} from "./intelligence/targetConditionedSegmentationBindingV1.js";
import { mergeExternalSemanticHandoffsV1 } from "./intelligence/external/semanticHandoffMergeV1.js";
import {
  validateTargetConditionedMaskMeasurementsV1,
  validateTargetConditionedMaskRegionsV1,
} from "./intelligence/targetConditionedMaskValidationV1.js";
import { applyLowerGarmentPurityV2 } from "./intelligence/lowerGarmentPurityV2.js";
import { applyUpperGarmentPurityV1 } from "./intelligence/upperGarmentPurityV1.js";
import { buildPublishedGarmentZonesV2 } from "./intelligence/publishedGarmentZonesV2.js";
import { applySignatureColorAuthorityV2 } from "./intelligence/signatureColorAuthorityV2.js";
import {
  applyUnresolvedMeasurementIntegrityGateV1,
  buildLocalMeasurementIntegritySynthesesV1,
  isValidatedFreshTargetMaskRegionV1,
  mergeCorrectionSynthesesV1,
} from "./intelligence/pieceMeasurementIntegrityV1.js";
import { buildSceneOwnershipV1 } from "./intelligence/sceneOwnershipV1.js";
import { runOpenAISemanticObserverV1 } from "./intelligence/external/openaiSemanticObserverV1.js";
import {
  runFalAutoSegmentationV1,
  runFalTargetMaskV1,
  segmentationProviderConfigV1,
  segmentationProviderOrderV1,
} from "./intelligence/external/segmentationProviderV1.js";
import { reconcileExternalSemanticsV1 } from "./intelligence/external/semanticReconciliationV1.js";
import {
  applySemanticIntrinsicPublicationV1,
  applySemanticIntrinsicRemeasurementV1,
} from "./intelligence/semanticIntrinsicRemeasurementV1.js";
import { buildSemanticPublicationConstraintsV1 } from "./intelligence/external/semanticPublicationPolicyV1.js";
import {
  buildTargetedAccessoryReanalysisPlanV1,
  filterTargetedAccessoryDetectionsV1,
  normalizeTargetedAccessoryReanalysisModeV1,
  resolveTargetedAccessoryReanalysisModeV1,
} from "./intelligence/targetedAccessoryReanalysisV1.js";
import { buildAccessoryIntelligenceLaneV1 } from "./intelligence/accessoryIntelligenceLaneV1.js";
import { executeAccessoryMicroCropRuntimeV1 } from "./intelligence/accessoryMicroCropRuntimeV1.js";
import { attachAccessoryPositiveMaskOwnershipV1 } from "./intelligence/accessoryPositiveMaskOwnershipV1.js";
import { applyAccessoryMaskRecoveryV1 } from "./intelligence/accessoryMaskRecoveryV1.js";
import { attachBeltLocalizationV1 } from "./intelligence/beltLocalizationV1.js";
import { resolveMaskStrengthV1, resolveOpaqueMaskStrengthV1 } from "./intelligence/maskStrengthV1.js";
import { normalizeExternalIntelligenceMode } from "./intelligence/visionCoreExternalIntelligencePolicyV1.js";
import { evaluateCaptureQualityV1 } from "./intelligence/captureQualityGateV1.js";
import { buildConsumerEvidenceV1 } from "./intelligence/consumerEvidenceV1.js";
import { buildAppearanceMeasurementSynthesesV1 } from "./intelligence/appearanceMeasurementSynthesisV1.js";
import { executeRuntimeSecondPassV1 } from "./intelligence/runtimeSecondPassV1.js";
import { aggregateMeasuredMaskColorsV1 } from "./intelligence/maskedPatternPaletteAggregationV1.js";
import { segmentationZoneForPieceV1 } from "./intelligence/pieceOntologyV1.js";
import { createTransformLatencyBudgetV1, shouldRunAccessoryEscalationV1 } from "./intelligence/transformLatencyBudgetV1.js";
import { buildGroundingDinoQueryPlanV1 } from "./intelligence/groundingDinoQueryPlanV1.js";
import { parseYoloWorldOutputV1, yoloClassNamesFromQueryV1 } from "./intelligence/yoloWorldFallbackV1.js";
import { sanitizeCustomerFacingZonesV1 } from "./intelligence/customerFacingZoneSanitizationV1.js";
import {
  cropDecodedImageToPngV1,
  normalizeDinoBboxPrecisionV1,
  remapCropDetectionToFullImageV1,
  remapCropMaskRegionToFullImageV1,
} from "./intelligence/accessoryTrueMicroCropV1.js";
import { getZoneFromLabel } from "./engines/zoneMapper/index.js";
import { mapDinoLabel } from "./engines/ontology/dinoMappings.js";
import {
  buildNamedHex,
  buildNamedHexes,
  getColorName,
  normalizeCategoryLabel,
  normalizeModeLabel,
} from "./engines/labelMapper/index.js";
import {
  deriveStyleIdentity as deriveStyleIdentityFromStyleIdentity,
} from "./engines/styleIdentity/index.js";
import { inferAccessoryDisplayMetadata } from "./ui/accessoryDisplay.js";
import {
  marketHeadwearPublicationEnabled,
  shouldPublishMarketAccessoryIdentity,
} from "./ui/marketPublicationPolicy.js";
import {
  CATEGORY_COMPATIBILITY,
  CATEGORY_SEARCH_KEYWORDS,
  CATEGORY_SUBTYPES,
} from "./engines/ontology/garmentTaxonomy.js";
import {
  OCCASION_IDS,
  OCCASION_CATEGORIES,
  OCCASION_MODES,
} from "./engines/ontology/occasionOntology.js";
import { getLiveBenchmarkStatusV1 } from "./evaluation/liveBenchmarkLedgerV1.js";

let scoreEngine = null;
try {
  scoreEngine = await import("./engines/score/index.js");
} catch (error) {
  console.warn("Score engine unavailable; using legacy scoring fallback.", error?.message || error);
}

dotenv.config();

const app = express();
const PORT = process.env.PORT || 10000;
const PIXELCUT_TIMEOUT_MS = 18000;
const LOWER_SAMPLING_VERSION = "multi_window_v1";
const PERCEPTION_V6_MODES = new Set(["shadow", "assist", "authoritative"]);

function normalizePerceptionV6Mode(value, fallback = "shadow") {
  const requested = String(value || "").trim().toLowerCase();
  if (PERCEPTION_V6_MODES.has(requested)) return requested;
  return PERCEPTION_V6_MODES.has(fallback) ? fallback : "shadow";
}

const MARKET_PERCEPTION_V6_MODE = normalizePerceptionV6Mode(
  process.env.PERCEPTION_V6_MODE,
  "assist"
);

// Market safety: headwear perception remains available internally, but customer-facing
// assist publication stays off until hair-vs-headwear discrimination is validated.
const MARKET_HEADWEAR_PUBLICATION_ENABLED = marketHeadwearPublicationEnabled(process.env);
// Market default is guarded assist: OpenAI may corroborate object identity and
// request bounded VisionCore reanalysis, and offer a blinded categorical color
// hypothesis for comparison with VisionCore's object-local HEX/LAB measurement.
// It can never supply color math, geometry, scores, or publication decisions. Missing credentials still skip
// cleanly and preserve the VisionCore result.
export const EXTERNAL_INTELLIGENCE_MODE = normalizeExternalIntelligenceMode(process.env.VISIONCORE_EXTERNAL_INTELLIGENCE_MODE, "assist");
const OPENAI_SEMANTIC_MODEL = process.env.OPENAI_SEMANTIC_MODEL || "gpt-5.6-luna";
export const TARGETED_ACCESSORY_REANALYSIS_MODE = normalizeTargetedAccessoryReanalysisModeV1(
  process.env.VISIONCORE_TARGETED_ACCESSORY_REANALYSIS_MODE,
  "assist"
);
const EXTERNAL_SEMANTIC_OBSERVER_BUDGET_MS = 8000;
const EARLY_SEMANTIC_OBSERVER_BUDGET_MS = Math.max(
  EXTERNAL_SEMANTIC_OBSERVER_BUDGET_MS,
  Number(process.env.VISIONCORE_EARLY_SEMANTIC_TIMEOUT_MS) || 35000
);
const EARLY_TARGET_SEGMENTATION_BUDGET_MS = Math.max(
  5000,
  Number(process.env.VISIONCORE_EARLY_TARGET_SEGMENTATION_TIMEOUT_MS) || 35000
);
const ACCESSORY_REANALYSIS_BUDGET_MS = 10000;
// The correction pass is local VisionCore work over masks already acquired.
// Keep its deadline independent from optional provider work so a slow first
// pass cannot silently disable contradiction recovery.
const RUNTIME_SECOND_PASS_BUDGET_MS = Math.max(
  1000,
  Math.min(25000, Number(process.env.VISIONCORE_SECOND_PASS_BUDGET_MS) || 25000)
);
const ACCESSORY_MICRO_CROP_SAM_TIMEOUT_MS = 15000;
const externalSemanticCache = new Map();

function buildExternalSemanticEvidence(outfitAnalysis = {}) {
  const zones = outfitAnalysis?.garment_zones?.zones || {};
  return {
      pipeline_version: "visioncore_external_handoff_v1",
    zones: Object.fromEntries(Object.entries(zones).map(([zoneKey, zone]) => [zoneKey, {
      publication_state: zone?.publication_state || null,
      garment_type: zone?.garment_type || zone?.label || null,
      color_mode: zone?.color_mode || zone?.interpretation || null,
      confidence: zone?.unified_confidence ?? zone?.calibrated_confidence ?? zone?.confidence ?? null,
    }])),
  };
}

function buildExternalCompositeDecision(outfitAnalysis = {}) {
  const zones = Object.values(outfitAnalysis?.garment_zones?.zones || {}).filter(Boolean);
  const confirmed = zones.length > 0 && zones.every((zone) => zone?.publication_state === "confirmed" || zone?.publication_decision === "publish");
  return { publication_state: confirmed ? "confirmed" : "possible" };
}

/* =========================
   CORS
========================= */
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-API-KEY"],
  })
);
app.options("*", cors());

/* =========================
   BODY PARSING
========================= */
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

/* =========================
   MULTER
========================= */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

/* =========================
   CLOUDINARY
========================= */
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

/* =========================
   BASIC ROUTES
========================= */
app.get("/", (_req, res) => {
  res.json({ ok: true, service: "cie-core-backend" });
});

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/debug/status", (_req, res) => {
  const segmentation = segmentationProviderConfigV1(process.env);
  res.json({
    ok: true,
    service: "cie-core-backend",
    port: PORT,
    env: {
      CLOUDINARY_CLOUD_NAME: !!process.env.CLOUDINARY_CLOUD_NAME,
      CLOUDINARY_API_KEY: !!process.env.CLOUDINARY_API_KEY,
      CLOUDINARY_API_SECRET: !!process.env.CLOUDINARY_API_SECRET,
      PIXELCUT_API_KEY: !!process.env.PIXELCUT_API_KEY,
      PIXELCUT_ENDPOINT: !!process.env.PIXELCUT_ENDPOINT,
      AMAZON_PARTNER_TAG: !!process.env.AMAZON_PARTNER_TAG,
      OPENAI_API_KEY: !!process.env.OPENAI_API_KEY,
      FAL_KEY: segmentation.fal_configured,
      REPLICATE_API_TOKEN: segmentation.replicate_configured,
      VISIONCORE_SEGMENTATION_PROVIDER: segmentation.requested,
      VISIONCORE_SEGMENTATION_PROVIDER_ORDER: segmentation.order,
      VISIONCORE_SEGMENTATION_PLAN_BINDING_V1: segmentationPlanBindingEnabledV1(process.env),
      FAL_TARGET_SEGMENTATION_MODEL: segmentation.fal_target_model,
      FAL_AUTO_SEGMENTATION_MODEL: segmentation.fal_auto_model,
      VISIONCORE_EXTERNAL_INTELLIGENCE_MODE: EXTERNAL_INTELLIGENCE_MODE,
      VISIONCORE_TARGETED_ACCESSORY_REANALYSIS_MODE: TARGETED_ACCESSORY_REANALYSIS_MODE,
      OPENAI_SEMANTIC_MODEL,
    },
  });
});

app.get("/api/benchmark/status", async (_req, res) => {
  try {
    return res.json({ ok: true, ...(await getLiveBenchmarkStatusV1()) });
  } catch (error) {
    return sendStepError(res, 503, "benchmark_status", error);
  }
});

/* =========================
   ERROR HELPERS
========================= */
function sendStepError(res, status, step, error, extra = {}) {
  return res.status(status).json({
    success: false,
    step,
    error: error?.message || String(error) || "Unknown error",
    ...extra,
  });
}

/* =========================
   GENERIC HELPERS
========================= */
function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

function clamp100(x) {
  return Math.max(0, Math.min(100, x));
}

function round2(x) {
  return Math.round(Number(x || 0) * 100) / 100;
}

function safeHex(hex) {
  try {
    return chroma(hex).hex().toUpperCase();
  } catch {
    return null;
  }
}

function avg(nums) {
  const clean = (nums || []).filter((n) => Number.isFinite(n));
  if (!clean.length) return 0;
  return clean.reduce((a, b) => a + b, 0) / clean.length;
}

function uniqHexes(arr) {
  const seen = new Set();
  const out = [];
  for (const hex of arr || []) {
    const safe = safeHex(hex);
    if (!safe) continue;
    if (seen.has(safe)) continue;
    seen.add(safe);
    out.push(safe);
  }
  return out;
}

function titleCase(value) {
  const s = String(value || "").trim().toLowerCase();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
}

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function getHue(hex) {
  try {
    const [h] = chroma(hex).hsl();
    return Number.isFinite(h) ? h : 0;
  } catch {
    return 0;
  }
}

function getSat(hex) {
  try {
    const [, s] = chroma(hex).hsl();
    return clamp01(s || 0);
  } catch {
    return 0;
  }
}

function getLight(hex) {
  try {
    const [, , l] = chroma(hex).hsl();
    return clamp01(l || 0);
  } catch {
    return 0;
  }
}

function isBlueHue(h) {
  return h >= 205 && h <= 252;
}

function isNavyCandidate(hex) {
  const safe = safeHex(hex);
  if (!safe) return false;
  const h = getHue(safe);
  const s = getSat(safe);
  const l = getLight(safe);
  const traits = getPerceptualTraits(safe);
  const chromaMagnitude = Number(traits?.chroma_magnitude || 0);

  if (!isBlueHue(h)) return false;
  if (l < 0.28 && (s < 0.2 || chromaMagnitude < 22)) return false;
  return s >= 0.18 && chromaMagnitude >= 20;
}

function isDarkOliveFamily(hex) {
  const safe = safeHex(hex);
  if (!safe) return false;

  const hue = getHue(safe);
  const saturation = getSat(safe);
  const lightness = getLight(safe);
  const [red, green, blue] = chroma(safe).rgb();
  const greenHighestOrTied = green >= red && green >= blue;

  return (
    lightness < 0.18 &&
    hue >= 60 &&
    hue < 105 &&
    saturation >= 0.06 &&
    greenHighestOrTied
  );
}


function hueDistance(a, b) {
  const ha = getHue(a);
  const hb = getHue(b);
  const d = Math.abs(ha - hb);
  return Math.min(d, 360 - d);
}

function colorDistanceLab(a, b) {
  try {
    return chroma.distance(a, b, "lab");
  } catch {
    return 0;
  }
}

function topNColorsByPct(topColors, n = 5) {
  return (topColors || [])
    .slice()
    .sort((a, b) => Number(b?.pct || 0) - Number(a?.pct || 0))
    .slice(0, n)
    .map((x) => x.hex)
    .filter(Boolean);
}

function rotateHue(hex, deg) {
  const c = chroma(hex);
  const [h, s, l] = c.hsl();
  const hh = ((h || 0) + deg + 360) % 360;
  return chroma.hsl(hh, clamp01(s || 0), clamp01(l || 0)).hex().toUpperCase();
}

function setTone(hex, { sMul = 1, lMul = 1, lAdd = 0, sAdd = 0 } = {}) {
  const c = chroma(hex);
  let [h, s, l] = c.hsl();
  h = Number.isFinite(h) ? h : 0;
  s = clamp01((s || 0) * sMul + sAdd);
  l = clamp01((l || 0) * lMul + lAdd);
  return chroma.hsl(h, s, l).hex().toUpperCase();
}

/* =========================
   LAB / PERCEPTUAL HELPERS
========================= */
function getLab(hex) {
  try {
    const [l, a, b] = chroma(hex).lab();
    return {
      l: round2(l),
      a: round2(a),
      b: round2(b),
    };
  } catch {
    return {
      l: 0,
      a: 0,
      b: 0,
    };
  }
}

function getChromaMagnitudeFromLab(lab) {
  const a = Number(lab?.a || 0);
  const b = Number(lab?.b || 0);
  return round2(Math.sqrt(a * a + b * b));
}

function getPerceptualTraits(hex) {
  const safe = safeHex(hex);
  if (!safe) {
    return {
      depth: "mid",
      temperature: "balanced",
      bias: "neutral",
      intensity: "balanced",
      chroma_magnitude: 0,
    };
  }

  const lab = getLab(safe);
  const chromaMagnitude = getChromaMagnitudeFromLab(lab);

  let depth = "mid";
  if (lab.l < 30) depth = "deep";
  else if (lab.l > 75) depth = "light";

  let temperature = "balanced";
  if (lab.a >= 8 || lab.b >= 8) temperature = "warm";
  else if (lab.a <= -8 || lab.b <= -8) temperature = "cool";

  let bias = "neutral";
  if (Math.abs(lab.a) > Math.abs(lab.b)) {
    if (lab.a > 8) bias = "red";
    else if (lab.a < -8) bias = "green";
  } else {
    if (lab.b > 8) bias = "yellow";
    else if (lab.b < -8) bias = "blue";
  }

  let intensity = "balanced";
  if (chromaMagnitude < 18) intensity = "muted";
  else if (chromaMagnitude > 55) intensity = "vivid";

  return {
    depth,
    temperature,
    bias,
    intensity,
    chroma_magnitude: chromaMagnitude,
  };
}


const COLOR_IDENTITY_TRANSLATIONS = {
  "Graphite": "Cool Gray",
  "Deep Crimson": "Dark Red",
  "Soft Linen": "Off White",
  "Warm Sand": "Golden Beige",
  "Cognac": "Caramel Brown",
  "Forest Green": "Dark Green",
  "Deep Navy": "Dark Blue",
  "Deep Olive": "Olive Green",
  "Rose": "Red-Pink",
  "Graphite Black": "Dark Gray",
};

function getColorIdentityTone(name, traits = {}) {
  const text = String(name || "").toLowerCase();
  if (text.includes("deep") || text.includes("dark") || text.includes("black") || traits.depth === "deep") return "deep";
  if (text.includes("soft") || text.includes("muted") || traits.intensity === "muted") return "soft";
  if (text.includes("light") || text.includes("linen") || traits.depth === "light") return "light";
  if (text.includes("vivid") || text.includes("bright") || traits.intensity === "vivid") return "vivid";
  if (text.includes("warm") || traits.temperature === "warm") return "warm";
  if (text.includes("cool") || traits.temperature === "cool") return "cool";
  return traits.depth || "balanced";
}

function getEverydayColorFamily(hex, classification = null, traits = null) {
  const safe = safeHex(hex);
  if (!safe) return "neutral";
  const meta = classification || classifyColorV2(safe);
  const perceptual = traits || getPerceptualTraits(safe);
  const light = getLight(safe);
  const sat = getSat(safe);
  const lane = meta?.lane || "other";

  if (sat < 0.12) {
    if (light < 0.18) return "black";
    if (light > 0.82) return "white";
    return "gray";
  }
  if (lane === "cyan") return "blue-green";
  if (meta?.family === "earth" && ["orange", "yellow"].includes(lane)) return "brown";
  if (lane === "pink") return "pink";
  if (lane && lane !== "other") return lane;
  return perceptual?.bias || meta?.family || "neutral";
}

function titleEverydayFamily(family) {
  return String(family || "neutral")
    .split("-")
    .map((part) => titleCase(part))
    .join("-");
}

function generateColorIdentityTranslation({ name, hex, family, tone, traits = {} }) {
  const text = String(name || "").toLowerCase();
  const everydayFamily = family || getEverydayColorFamily(hex, null, traits);
  const familyLabel = titleEverydayFamily(everydayFamily);

  if (text.includes("taupe")) return "Brown Gray";
  if (text.includes("teal")) return tone === "deep" ? "Dark Blue-Green" : "Blue-Green";
  if (text.includes("olive")) return tone === "deep" ? "Olive Green" : tone === "soft" ? "Soft Green" : "Green";
  if (text.includes("linen") || text.includes("ivory") || text.includes("cream")) return "Off White";
  if (text.includes("navy")) return "Dark Blue";
  if (text.includes("crimson") || text.includes("burgundy")) return tone === "deep" ? "Dark Red" : "Red";
  if (text.includes("cognac")) return "Caramel Brown";
  if (text.includes("sand") || text.includes("beige")) return traits.temperature === "warm" || text.includes("warm") ? "Golden Beige" : "Beige";

  if (tone === "deep") return `Dark ${familyLabel}`;
  if (tone === "soft" || tone === "muted") return `Soft ${familyLabel}`;
  if (tone === "light") return everydayFamily === "white" ? "Off White" : `Light ${familyLabel}`;
  return familyLabel;
}

function buildColorIdentity({ name, hex, family = null, tone = null, perceptual = null } = {}) {
  const safe = safeHex(hex);
  const visionName = String(name || (safe ? getColorName(safe) : "Unknown")).trim();
  const classification = safe ? classifyColorV2(safe) : null;
  const traits = perceptual || (safe ? getPerceptualTraits(safe) : {});
  const identityFamily = family || getEverydayColorFamily(safe, classification, traits);
  const identityTone = tone || getColorIdentityTone(visionName, traits);
  const translation = COLOR_IDENTITY_TRANSLATIONS[visionName] || generateColorIdentityTranslation({
    name: visionName,
    hex: safe,
    family: identityFamily,
    tone: identityTone,
    traits,
  });

  return {
    name: visionName,
    translation,
    family: identityFamily,
    tone: identityTone,
  };
}

function withColorIdentity(color) {
  if (!color) return color;
  const hex = safeHex(color?.hex || color?.base);
  const name = color?.name || (hex ? getColorName(hex) : "Unknown");
  return {
    ...color,
    color_identity: color.color_identity || buildColorIdentity({
      name,
      hex,
      family: color?.family,
      tone: color?.tone,
      perceptual: color?.perceptual || color?.perceptual_traits,
    }),
  };
}

function buildColorIdentitySummary(identity, role = "dominant color family") {
  if (!identity?.name) return null;
  return `${identity.name} (${identity.translation}) is the ${role}.`;
}

function buildGarmentIdentity(primaryColor, secondaryColors = []) {
  const primaryIdentity = primaryColor?.color_identity || withColorIdentity(primaryColor)?.color_identity || null;
  return {
    primary_identity: primaryIdentity ? {
      name: primaryIdentity.name,
      translation: primaryIdentity.translation,
    } : null,
    secondary_identities: (secondaryColors || [])
      .map((color) => color?.color_identity || withColorIdentity(color)?.color_identity)
      .filter(Boolean)
      .map((identity) => ({ name: identity.name, translation: identity.translation })),
  };
}

/* =========================
   COLOR PROFILES
========================= */
function buildColorProfile(hex, pct = 0) {
  const safe = safeHex(hex);
  if (!safe) return null;

  const classification = classifyColorV2(safe);
  const lab = getLab(safe);
  const traits = getPerceptualTraits(safe);

  return withColorIdentity({
    hex: safe,
    name: getColorName(safe),
    pct: round2(pct),
    hue: round2(getHue(safe)),
    sat: round2(getSat(safe)),
    light: round2(getLight(safe)),
    lab,
    perceptual: traits,
    family: classification.family,
    lane: classification.lane,
    vivid: classification.vivid,
    color_identity: buildColorIdentity({
      name: getColorName(safe),
      hex: safe,
      family: getEverydayColorFamily(safe, classification, traits),
      perceptual: traits,
    }),
  });
}

function isGarmentZoneKey(zoneKey) {
  return ["upper_garment", "lower_garment", "outerwear", "body_garment"].includes(zoneKey);
}

function compactColorRead(color) {
  const safe = safeHex(color?.hex || color?.base);
  if (!safe) return null;
  const pixelCount = Number(color?.pixel_count);
  const totalOwnedPixelCount = Number(color?.total_owned_pixel_count);
  const measuredRatio = Number(color?.measured_ratio);
  const exactRatio = Number.isFinite(pixelCount) && pixelCount >= 0 && Number.isFinite(totalOwnedPixelCount) && totalOwnedPixelCount > 0
    ? Math.max(0, Math.min(1, pixelCount / totalOwnedPixelCount))
    : Number.isFinite(measuredRatio) && measuredRatio >= 0
      ? normalizeColorPct(measuredRatio)
      : null;
  const read = {
    hex: safe,
    name: color?.name || getColorName(safe),
    pct: exactRatio ?? round2(color?.pct || 0),
  };
  for (const key of ["measured_ratio", "pixel_count", "total_owned_pixel_count"]) {
    const value = Number(color?.[key]);
    if (Number.isFinite(value)) read[key] = value;
  }
  if (color?.display_pct !== undefined) {
    read.display_pct = round2(normalizeColorPct(color.display_pct));
    read.percentage = formatColorPct(read.display_pct);
  } else if (color?.percentage !== undefined) {
    read.percentage = color.percentage;
  }
  return withColorIdentity(read);
}

function joinHumanList(values = []) {
  const clean = values.map((v) => String(v || "").trim()).filter(Boolean);
  if (clean.length <= 1) return clean[0] || "";
  if (clean.length === 2) return `${clean[0]} and ${clean[1]}`;
  return `${clean.slice(0, -1).join(", ")}, and ${clean[clean.length - 1]}`;
}

function colorIsSoftNeutral(color) {
  const hex = safeHex(color?.hex || color?.base);
  if (!hex) return false;
  const classification = classifyColorV2(hex);
  const traits = getPerceptualTraits(hex);
  return classification.family === "neutral" || Number(traits.chroma_magnitude || 0) < 22;
}

function buildColorStory(primaryColor, secondaryColors = [], accentColors = []) {
  if (!primaryColor?.name) return null;

  const secondaryNames = secondaryColors.map((c) => c.name).filter(Boolean);
  const accentNames = accentColors.map((c) => c.name).filter(Boolean);
  const mainNames = [primaryColor.name, ...secondaryNames].filter(Boolean);

  if (!secondaryNames.length && !accentNames.length) {
    return `This garment is primarily ${primaryColor.name}.`;
  }

  const mainPhrase = joinHumanList(mainNames);
  if (!accentNames.length) {
    return `This garment combines ${mainPhrase}.`;
  }

  const allAccentsAreNeutral = accentColors.length > 0 && accentColors.every(colorIsSoftNeutral);
  const accentPhrase = allAccentsAreNeutral
    ? "soft neutral accents"
    : `${joinHumanList(accentNames)} accents`;

  return `This garment combines ${mainPhrase} with ${accentPhrase}.`;
}

function buildGarmentColorProfile({ zoneKey, mode, dominantColor, supportColors = [], accentColors = [] }) {
  if (!isGarmentZoneKey(zoneKey) || !["multicolor", "multi_color"].includes(mode)) return {};

  const primaryColor = compactColorRead(dominantColor);
  if (!primaryColor) return {};

  const secondaryColors = (supportColors || []).map(compactColorRead).filter(Boolean);
  const accents = (accentColors || []).map(compactColorRead).filter(Boolean);

  return {
    primary_color: primaryColor,
    secondary_colors: secondaryColors,
    accent_colors: accents,
    color_story: buildColorStory(primaryColor, secondaryColors, accents),
  };
}

function normalizeColorPct(pct = 0) {
  const value = Number(pct || 0);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return value > 1 ? value / 100 : value;
}

function formatColorPct(pct = 0) {
  return `${Math.round(normalizeColorPct(pct) * 100)}%`;
}

function compactRegionColor(color) {
  const hex = safeHex(color?.hex || color?.base);
  if (!hex) return null;
  const pixelCount = Number(color?.pixel_count);
  const totalOwnedPixelCount = Number(color?.total_owned_pixel_count);
  const measuredRatio = Number(color?.measured_ratio);
  const hasPixelRatio = Number.isFinite(pixelCount) && pixelCount >= 0 && Number.isFinite(totalOwnedPixelCount) && totalOwnedPixelCount > 0;
  const exactRatio = hasPixelRatio
    ? Math.max(0, Math.min(1, pixelCount / totalOwnedPixelCount))
    : Number.isFinite(measuredRatio) && measuredRatio >= 0
      ? normalizeColorPct(measuredRatio)
      : null;
  const pct = exactRatio ?? round2(normalizeColorPct(color?.pct));
  return withColorIdentity({
    hex,
    name: color?.name || getColorName(hex),
    pct,
    ...(exactRatio === null ? {} : {
      display_pct: exactRatio,
      measured_ratio: exactRatio,
    }),
    ...(Number.isFinite(pixelCount) ? { pixel_count: pixelCount } : {}),
    ...(Number.isFinite(totalOwnedPixelCount) ? { total_owned_pixel_count: totalOwnedPixelCount } : {}),
    percentage: formatColorPct(pct),
  });
}

function deriveSignatureColorDisplayRead(zoneRead = {}, zoneKey = "") {
  const displayWorthyPct = ["bag", "footwear", "accessory_jewelry", "eyewear"].includes(zoneKey) ? 0.1 : 0.12;
  const distinctDistance = 14;
  const dominantHex = safeHex(zoneRead?.dominant_color?.hex || "");
  const primaryHex = safeHex(zoneRead?.primary_color?.hex || "");
  const anchorHex = primaryHex || dominantHex;
  const regionColors = Array.isArray(zoneRead?.region_colors)
    ? zoneRead.region_colors.map(compactRegionColor).filter(Boolean)
    : [];
  const isDistinctFromAnchor = (color) => {
    const hex = safeHex(color?.hex || "");
    if (!hex || !anchorHex) return false;
    if (hex === anchorHex) return false;
    return colorDistanceLab(hex, anchorHex) >= distinctDistance;
  };
  const toSignatureColor = (color, source, reason) => {
    const hex = safeHex(color?.hex || "");
    if (!hex) return null;
    return {
      hex,
      name: color?.name || getColorName(hex),
      reason,
      source,
      display_only: true,
    };
  };

  const secondaryRegionColor = regionColors
    .slice(1)
    .find((color) => normalizeColorPct(color?.pct) >= displayWorthyPct && isDistinctFromAnchor(color));
  if (secondaryRegionColor) {
    return toSignatureColor(
      secondaryRegionColor,
      "region_colors",
      "Meaningful secondary color from finalized region_colors."
    );
  }

  const topRegionColor = regionColors[0];
  if (
    topRegionColor &&
    normalizeColorPct(topRegionColor?.pct) >= displayWorthyPct &&
    primaryHex &&
    dominantHex &&
    primaryHex !== dominantHex &&
    safeHex(topRegionColor.hex) !== primaryHex &&
    colorDistanceLab(topRegionColor.hex, primaryHex) >= distinctDistance
  ) {
    return toSignatureColor(
      topRegionColor,
      "region_colors",
      "Distinct finalized region color provides display-only style identity."
    );
  }

  if (dominantHex && primaryHex && dominantHex !== primaryHex && colorDistanceLab(dominantHex, primaryHex) >= distinctDistance) {
    return toSignatureColor(
      zoneRead.dominant_color,
      "dominant_color",
      "Dominant color differs from finalized primary color and is useful as display-only context."
    );
  }

  const identity = zoneRead?.dominant_color?.color_identity || zoneRead?.primary_color?.color_identity || null;
  const identityName = String(identity?.name || "").trim();
  const identityHex = safeHex(identity?.hex || dominantHex || primaryHex || "");
  const readName = String(zoneRead?.dominant_color?.name || zoneRead?.primary_color?.name || "").trim();
  if (identityHex && identityName && readName && identityName.toLowerCase() !== readName.toLowerCase()) {
    return {
      hex: identityHex,
      name: identityName,
      reason: "Finalized color_identity adds display-only style context.",
      source: "color_identity",
      display_only: true,
    };
  }

  return null;
}


function getColorSummaryName(color = {}) {
  const hex = safeHex(color?.hex || color?.base);
  return String(color?.name || (hex ? getColorName(hex) : "Unknown")).trim();
}

function mergeColorSummaryFamilies(colors = []) {
  const groups = new Map();
  for (const color of colors || []) {
    const compact = compactRegionColor(color);
    if (!compact?.name) continue;
    const key = compact.name.toLowerCase();
    const existing = groups.get(key);
    const pct = normalizeColorPct(compact.pct);
    const hasExactMeasurement = Number.isFinite(Number(compact?.measured_ratio));
    if (existing) {
      existing.pct = round2(normalizeColorPct(existing.pct) + pct);
      existing._hasExactMeasurement ||= hasExactMeasurement;
      existing.percentage = formatColorPct(existing.pct);
      if (pct > Number(existing._topPct || 0)) {
        existing.hex = compact.hex;
        existing.color_identity = compact.color_identity;
        existing._topPct = pct;
      }
    } else {
      groups.set(key, { ...compact, pct, percentage: formatColorPct(pct), _topPct: pct, _hasExactMeasurement: hasExactMeasurement });
    }
  }
  const mergedColors = Array.from(groups.values());
  const totalPct = mergedColors.reduce((sum, color) => sum + normalizeColorPct(color?.pct), 0);
  return mergedColors
    .map(({ _topPct, _hasExactMeasurement, ...color }) => {
      const displayPct = totalPct > 0
        ? (_hasExactMeasurement ? normalizeColorPct(color.pct) : normalizeColorPct(color.pct) / totalPct)
        : 0;
      return withColorIdentity({
        ...color,
        display_pct: _hasExactMeasurement ? displayPct : round2(displayPct),
        percentage: formatColorPct(displayPct),
      });
    })
    .sort((a, b) => Number(b?.pct || 0) - Number(a?.pct || 0));
}

function mergeColorReadSummaryFamilies(colors = []) {
  return mergeColorSummaryFamilies(colors).map(compactColorRead).filter(Boolean);
}

function mergeClusterSummaryFamilies(clusters = []) {
  return mergeColorSummaryFamilies((clusters || []).map((c) => ({
    ...c,
    hex: c?.base || c?.hex,
    name: c?.name || getDominantClusterInputName(c) || getColorSummaryName(c),
    pct: c?.pct,
  })));
}

function shouldPreserveDominantAccessoryColor(zoneKey, clusters = []) {
  if (!["accessory_jewelry", "bag", "eyewear", "headwear"].includes(zoneKey)) return false;
  const sorted = (clusters || [])
    .filter((c) => safeHex(c?.base || c?.hex))
    .map((c) => ({ ...c, pct: normalizeColorPct(c?.pct) }))
    .sort((a, b) => Number(b?.pct || 0) - Number(a?.pct || 0));
  const topPct = Number(sorted?.[0]?.pct || 0);
  const secondPct = Number(sorted?.[1]?.pct || 0);
  return topPct >= 0.75 && topPct >= secondPct * 2;
}

function getDominantClusterInputName(cluster) {
  const colors = Array.isArray(cluster?.colors) ? cluster.colors : [];
  let best = null;
  for (const color of colors) {
    const name = typeof color?.name === "string" ? color.name.trim() : "";
    if (!name) continue;
    const pct = normalizeColorPct(color?.pct);
    if (!best || pct > best.pct) best = { name, pct };
  }
  return best?.name || null;
}

function buildPreservedAccessoryColor(cluster, fallback = {}) {
  const hex = safeHex(cluster?.base || fallback?.hex || fallback?.base);
  if (!hex) return null;
  const name = getDominantClusterInputName(cluster) || fallback?.name || getColorName(hex);
  return withColorIdentity({
    hex,
    name,
    pct: round2(cluster?.pct ?? fallback?.pct ?? 0),
  });
}

function getZoneColorMode(clusters = []) {
  const sorted = (clusters || [])
    .filter((c) => safeHex(c?.base || c?.hex))
    .map((c) => ({ ...c, pct: normalizeColorPct(c?.pct) }))
    .sort((a, b) => Number(b?.pct || 0) - Number(a?.pct || 0));
  const topPct = Number(sorted?.[0]?.pct || 0);
  const secondPct = Number(sorted?.[1]?.pct || 0);
  const meaningfulCount = sorted.filter((c) => Number(c?.pct || 0) >= 0.08).length;
  const repeatedSecondary = sorted.slice(1).find((c) =>
    c?.pattern_repetition_supported === true &&
    Number(c?.pct || 0) >= 0.025 &&
    colorDistanceLab(sorted[0]?.base || sorted[0]?.hex, c?.base || c?.hex) >= 6
  );
  const reason = sorted.length > 0 && topPct < 0.55
    ? "top_pct_lt_0_55"
    : secondPct >= 0.18
      ? "second_pct_gte_0_18"
      : meaningfulCount >= 3
        ? "three_colors_pct_gte_0_08"
        : repeatedSecondary
          ? "spatially_repeated_secondary"
        : null;
  return {
    color_mode: reason ? "multi_color" : "single_color",
    reason,
    topPct,
    secondPct,
    meaningfulCount,
  };
}

function buildEvidenceSummary(colorMode, clusters = [], source = null) {
  const summaryColors = mergeClusterSummaryFamilies(clusters);
  const primary = summaryColors?.[0] || null;
  const secondary = summaryColors.slice(1, 4);
  if (!primary) return "No reliable color evidence for this zone.";
  const sourcePhrase = source ? ` from ${source}` : "";
  if (colorMode === "multi_color") {
    const support = secondary.map((c) => `${c.name} (${c.percentage})`);
    return `Primary ${primary.name} (${primary.percentage})${support.length ? ` supported by ${joinHumanList(support)}` : ""}${sourcePhrase}.`;
  }
  return `Primary ${primary.name} (${primary.percentage}) is the dominant zone read${sourcePhrase}.`;
}

function isAccessoryDinoPaletteZone(zoneKey) {
  return ["accessory_jewelry", "bag", "belt", "eyewear", "headwear", "scarf", "scarves"].includes(zoneKey);
}

function getAccessoryDetectedColorName(color = {}) {
  const hex = safeHex(color?.hex || color?.base);
  if (!hex) return color?.name || "Unknown";
  const traits = getPerceptualTraits(hex);
  if (
    !isNavyCandidate(hex) &&
    getLight(hex) < 0.24 &&
    Number(traits?.chroma_magnitude || 0) < 22
  ) {
    return getBlackNuanceLabel(hex);
  }
  return color?.name || getColorName(hex);
}

function buildAccessoryDinoDetectedPalette(regionColors = []) {
  return (Array.isArray(regionColors) ? regionColors : [])
    .map((color) => compactRegionColor({
      ...color,
      name: getAccessoryDetectedColorName(color),
    }))
    .filter(Boolean);
}

function splitAccessoryDetectedPaletteRoles(detectedPalette = []) {
  const rows = Array.isArray(detectedPalette) ? detectedPalette : [];
  return {
    primary: rows[0] ? compactColorRead(rows[0]) : null,
    secondary: rows.slice(1).filter((color) => normalizeColorPct(color?.pct) > 0).map(compactColorRead).filter(Boolean),
    accent: rows.slice(1).filter((color) => normalizeColorPct(color?.pct) <= 0).map(compactColorRead).filter(Boolean),
  };
}

function isAccessoryDisplayPaletteZone(zoneKey) {
  return ["accessory_jewelry", "bag", "belt", "eyewear", "headwear"].includes(zoneKey);
}

function isBrownFamilyHex(hex) {
  const safe = safeHex(hex);
  if (!safe) return false;
  const hue = getHue(safe);
  const sat = getSat(safe);
  const light = getLight(safe);
  return hue >= 8 && hue <= 55 && sat >= 0.22 && light >= 0.08 && light <= 0.62;
}

function preserveAccessoryRawPalette(colors = []) {
  return (Array.isArray(colors) ? colors : [])
    .map((color) => {
      const hex = safeHex(color?.hex || color?.base);
      if (!hex) return null;
      return {
        ...color,
        hex,
        name: getAccessoryDetectedColorName({ ...color, hex }),
        pct: color?.pct,
      };
    })
    .filter(Boolean);
}

function accessoryPaletteContaminationReason(color = {}) {
  const hex = safeHex(color?.hex || color?.base);
  if (!hex) return "invalid_hex";
  const pct = normalizeColorPct(color?.pct);
  if (pct <= 0) return null;
  if (isBrownFamilyHex(hex)) return null;
  const hue = getHue(hex);
  const sat = getSat(hex);
  const light = getLight(hex);
  if (light >= 0.86 && sat <= 0.2) return "highlight_or_glare";
  if (hue >= 8 && hue <= 55 && sat >= 0.12 && sat <= 0.55 && light >= 0.48 && light <= 0.86) {
    return "skin_or_beige_contamination";
  }
  return null;
}

function filterAccessoryDisplayPalette(colors = []) {
  const kept = [];
  const rejected = [];
  for (const color of buildAccessoryDinoDetectedPalette(colors)) {
    const reason = accessoryPaletteContaminationReason(color);
    if (reason) rejected.push({ hex: color.hex, pct: color.pct, reason });
    else kept.push(color);
  }
  return { kept, rejected };
}

function selectAccessoryDisplayPalette({ refinedCrop = [], candidateRegion = [], rawDino = [], detector = [], fallback = [] } = {}) {
  const sources = [
    ["refined_crop", refinedCrop],
    ["candidate_region", candidateRegion],
    ["raw_dino", rawDino],
    ["detector", detector],
    ["fallback", fallback],
  ];
  const source_trace = [];
  for (const [source, colors] of sources) {
    const { kept, rejected } = filterAccessoryDisplayPalette(colors);
    source_trace.push({ source, input_count: Array.isArray(colors) ? colors.length : 0, surviving_count: kept.length, rejected });
    if (kept.length) {
      return {
        palette: kept,
        selected_source: source,
        trace: {
          selected_source: source,
          precedence: ["refined_crop", "candidate_region", "raw_dino", "detector", "fallback"],
          reason_not_replaced: "higher_priority_confirmed_values_are_authoritative",
          sources: source_trace,
        },
      };
    }
  }
  return {
    palette: [],
    selected_source: null,
    trace: {
      selected_source: null,
      precedence: ["refined_crop", "candidate_region", "raw_dino", "detector", "fallback"],
      reason_not_replaced: "no_publishable_accessory_palette_survived",
      sources: source_trace,
    },
  };
}


function normalizeConfidencePercent(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return 0;
  return n <= 1 ? clamp100(n * 100) : clamp100(n);
}

function calibrateConfidence(value, { evidenceWeight = 1, floor = 1, ceiling = 99 } = {}) {
  const normalized = normalizeConfidencePercent(value);
  const weighted = normalized * clamp01(Number(evidenceWeight || 0));
  return Math.round(Math.max(floor, Math.min(ceiling, weighted)));
}

function displayPaletteEvidenceWeight(source) {
  if (source === "refined_crop") return 1;
  if (source === "candidate_region") return 0.95;
  if (source === "raw_dino") return 0.88;
  if (source === "detector") return 0.8;
  return 0.7;
}

function calibrateDisplayColorConfidence({
  zoneConfidence = 0,
  colorPct = 0,
  sourceConfidence = 0,
  evidenceWeight = 1,
} = {}) {
  const zone = normalizeConfidencePercent(zoneConfidence) / 100;
  const pct = clamp01(normalizeColorPct(colorPct));
  const source = normalizeConfidencePercent(sourceConfidence) / 100;
  const combined = (zone * 0.55 + pct * 0.30 + source * 0.15) * 100;
  return calibrateConfidence(combined, { evidenceWeight, floor: 1, ceiling: 99 });
}

function withDisplayColorConfidence(color, context = {}) {
  if (!color) return color;
  return {
    ...color,
    confidence: calibrateDisplayColorConfidence({
      zoneConfidence: context.zoneConfidence,
      colorPct: color?.pct,
      sourceConfidence: context.sourceConfidence,
      evidenceWeight: context.evidenceWeight,
    }),
  };
}

function buildContaminationEvidenceScore({ dominant = null, regionCoverage = 0, suppressionGates = {} } = {}) {
  const hex = safeHex(dominant?.base || dominant?.hex || "");
  const pct = clamp01(normalizeColorPct(dominant?.pct));
  const hue = hex ? getHue(hex) : 0;
  const sat = hex ? getSat(hex) : 0;
  const light = hex ? getLight(hex) : 0;
  const skinLike = hex && !isBrownFamilyHex(hex) && hue >= 8 && hue <= 55 && sat >= 0.12 && sat <= 0.55 && light >= 0.42 && light <= 0.88 ? 1 : 0;
  const highlightLike = hex && light >= 0.82 && sat <= 0.22 ? 1 : 0;
  const neutralWeak = suppressionGates?.isNeutralContamination ? 1 : 0;
  const lowSignal = suppressionGates?.lowSignalRegion ? 1 : 0;
  const weakDominant = suppressionGates?.isWeakDominantEvidence ? 1 : 0;
  const legacySkinGate = suppressionGates?.jewelrySkinContamination ? 1 : 0;
  const lackOfCoverage = clamp01(1 - Number(regionCoverage || 0));
  const components = {
    skin_like: round2(skinLike * 0.34),
    highlight_like: round2(highlightLike * 0.24),
    neutral_weak: round2(neutralWeak * 0.12),
    low_signal: round2(lowSignal * 0.08),
    weak_dominant: round2(weakDominant * 0.08),
    legacy_skin_gate: round2(legacySkinGate * 0.08),
    low_coverage: round2(lackOfCoverage * (1 - pct) * 0.06),
  };
  const total = round2(Object.values(components).reduce((sum, value) => sum + Number(value || 0), 0));
  return { total, components };
}

function flattenRejectedDisplayAlternatives(trace = null) {
  return (trace?.sources || []).flatMap((sourceRow) =>
    (sourceRow?.rejected || []).map((candidate) => ({
      source: sourceRow.source,
      hex: candidate.hex || null,
      pct: candidate.pct ?? null,
      rejection_reason: candidate.reason || "not_selected",
    }))
  );
}

function buildRawDinoColorClusters(regionColors = []) {
  const clusters = [];

  for (const color of regionColors || []) {
    const hex = safeHex(color?.hex);
    if (!hex) continue;

    const pct = normalizeColorPct(color?.pct);
    if (pct <= 0) continue;

    let placed = false;
    for (const cluster of clusters) {
      const sameHueFamily = hueDistance(hex, cluster.base) <= 18;
      const bothNeutral = getSat(hex) < 0.16 && getSat(cluster.base) < 0.16;
      if (colorDistanceLab(hex, cluster.base) < 10 && (sameHueFamily || bothNeutral)) {
        cluster.colors.push(color);
        cluster.weight += pct;
        if (pct > Number(cluster.topPct || 0)) {
          cluster.base = hex;
          cluster.topPct = pct;
        }
        placed = true;
        break;
      }
    }

    if (!placed) {
      clusters.push({
        base: hex,
        colors: [color],
        weight: pct,
        topPct: pct,
      });
    }
  }

  return clusters
    .map((cluster) => ({
      ...cluster,
      pct: round2(cluster.weight),
    }))
    .sort((a, b) => Number(b?.pct || 0) - Number(a?.pct || 0));
}

/* =========================
   VISUAL IMPORTANCE LAYER
========================= */
function isNearWhite(hex) {
  const safe = safeHex(hex);
  if (!safe) return false;
  const lab = getLab(safe);
  const chromaMagnitude = getChromaMagnitudeFromLab(lab);
  return lab.l >= 78 && chromaMagnitude <= 22;
}

function isNearBlack(hex) {
  const safe = safeHex(hex);
  if (!safe) return false;
  const lab = getLab(safe);
  const chromaMagnitude = getChromaMagnitudeFromLab(lab);
  return lab.l <= 26 && chromaMagnitude <= 20;
}

function buildVisualImportance(hex, pct = 0) {
  const safe = safeHex(hex);
  if (!safe) return null;

  const lab = getLab(safe);
  const traits = getPerceptualTraits(safe);
  const classification = classifyColorV2(safe);

  const light = getLight(safe);
  const sat = getSat(safe);
  const chromaMagnitude = Number(traits.chroma_magnitude || 0);

  const highlightStrength = isNearWhite(safe)
    ? clamp100((lab.l - 72) * 2.2 + (22 - Math.min(chromaMagnitude, 22)) * 1.5)
    : 0;

  const shadowStrength = isNearBlack(safe)
    ? clamp100((30 - lab.l) * 2.6 + (20 - Math.min(chromaMagnitude, 20)) * 1.4)
    : 0;

  const accentStrength = clamp100(
    Math.min(40, chromaMagnitude * 0.6) +
      Math.min(34, sat * 38) +
      Math.min(26, Math.abs(lab.a) * 0.32 + Math.abs(lab.b) * 0.24)
  );

  const contrastPotential = Math.round(
    clamp100(
      highlightStrength * 0.42 +
        shadowStrength * 0.42 +
        accentStrength * 0.32 +
        Number(pct || 0) * 12
    )
  );

  const visualWeight = Math.round(
    clamp100(
      Number(pct || 0) * 62 +
        highlightStrength * 0.38 +
        shadowStrength * 0.38 +
        accentStrength * 0.26
    )
  );

  return {
    hex: safe,
    pct: round2(pct),
    highlight_strength: Math.round(highlightStrength),
    shadow_strength: Math.round(shadowStrength),
    accent_strength: Math.round(accentStrength),
    contrast_potential: contrastPotential,
    visual_weight: visualWeight,
    role_hint:
      highlightStrength >= 60
        ? "highlight"
        : shadowStrength >= 60
          ? "shadow"
          : accentStrength >= 52
            ? "accent"
            : "body",
    family: classification.family,
    lane: classification.lane,
    light: round2(light),
    sat: round2(sat),
    lab,
    perceptual: traits,
  };
}

function collectImportantColors(topColors, dominantHex) {
  const sourceHexes = uniqHexes([dominantHex, ...topNColorsByPct(topColors, 8)]);
  const out = [];

  for (const hex of sourceHexes) {
    const pct = Number(topColors?.find((x) => safeHex(x?.hex) === hex)?.pct || 0);
    const importance = buildVisualImportance(hex, pct);
    if (!importance) continue;
    out.push({
      hex,
      name: getColorName(hex),
      pct: round2(pct),
      importance,
      lab: importance.lab,
      perceptual: importance.perceptual,
    });
  }

  const sortedByImportance = [...out].sort(
    (a, b) => Number(b?.importance?.visual_weight || 0) - Number(a?.importance?.visual_weight || 0)
  );

  const sortedByContrast = [...out].sort(
    (a, b) => Number(b?.importance?.contrast_potential || 0) - Number(a?.importance?.contrast_potential || 0)
  );

  return {
    important_colors: sortedByImportance.slice(0, 6),
    contrast_colors: sortedByContrast.slice(0, 4),
  };
}

function mergeDominantAndImportantColors(topColors, dominantHex) {
  const dominantPool = uniqHexes([dominantHex, ...topNColorsByPct(topColors, 6)]);
  const { important_colors } = collectImportantColors(topColors, dominantHex);

  const mergedHexes = uniqHexes([
    ...dominantPool,
    ...important_colors.map((x) => x.hex),
  ]);

  return mergedHexes.slice(0, 8).map((hex, idx) => {
    const pct =
      idx === 0
        ? Math.max(0.3, Number(topColors?.find((x) => safeHex(x?.hex) === hex)?.pct || 0) || 0.3)
        : Number(topColors?.find((x) => safeHex(x?.hex) === hex)?.pct || 0);

    const profile = buildColorProfile(hex, pct);
    const importance = buildVisualImportance(hex, pct);

    return {
      hex: profile.hex,
      name: profile.name,
      pct: profile.pct,
      hue: profile.hue,
      sat: profile.sat,
      light: profile.light,
      lab: profile.lab,
      perceptual: profile.perceptual,
      family: profile.family,
      lane: profile.lane,
      vivid: profile.vivid,
      color_identity: profile.color_identity,
      importance,
    };
  });
}

/* =========================
   STRUCTURAL COLOR INTELLIGENCE
========================= */
function classifyStructuralRole(color) {
  const labL = Number(color?.lab?.l || 0);
  const chroma = Number(color?.perceptual?.chroma_magnitude || 0);
  const importance = Number(color?.importance?.visual_weight || 0);
  const highlightStrength = Number(color?.importance?.highlight_strength || 0);
  const shadowStrength = Number(color?.importance?.shadow_strength || 0);

  if (labL > 80 && chroma < 25 && (importance > 35 || highlightStrength > 45)) {
    return "highlight";
  }

  if (labL < 28 && chroma < 25 && (importance > 35 || shadowStrength > 45)) {
    return "shadow";
  }

  if (importance > 65 && chroma < 30) {
    return "graphic";
  }

  if (chroma > 40 || color?.vivid) {
    return "accent";
  }

  if (importance > 30) {
    return "trim";
  }

  return "body";
}
/* =========================
   VISUAL INTELLIGENCE LAYER
========================= */

function classifySurfaceRole(color, dominantHex = null) {
  const hex = safeHex(color?.hex);
  if (!hex) return "body";

  const pct = Number(color?.pct || 0);
  const labL = Number(color?.lab?.l || 0);
  const chromaMagnitude = Number(color?.perceptual?.chroma_magnitude || 0);
  const visualWeight = Number(color?.importance?.visual_weight || 0);
  const contrastPotential = Number(color?.importance?.contrast_potential || 0);
  const highlightStrength = Number(color?.importance?.highlight_strength || 0);
  const shadowStrength = Number(color?.importance?.shadow_strength || 0);
  const accentStrength = Number(color?.importance?.accent_strength || 0);
  const structuralRole = normalizeText(color?.structural_role || "body");

  const dominantDist = dominantHex ? colorDistanceLab(hex, dominantHex) : 0;

  if (highlightStrength >= 60 && pct <= 0.3) return "highlight_trim";
  if (shadowStrength >= 60 && pct <= 0.35) return "shadow_structure";

  if (
    contrastPotential >= 70 &&
    accentStrength >= 50 &&
    pct <= 0.18 &&
    dominantDist >= 15
  ) {
    return "graphic_detail";
  }
// 🔥 NEW: differentiate large light vs dark surfaces
if (pct >= 0.22 && visualWeight >= 40 && labL > 60) {
  return "light_field";
}

if (pct >= 0.22 && visualWeight >= 40 && labL < 40) {
  return "dark_field";
}
  if (pct >= 0.22 && visualWeight >= 40 && structuralRole === "body") {
    return "body_fabric";
  }

  if (pct <= 0.15 && chromaMagnitude <= 25) {
    return "trim";
  }

  if (accentStrength >= 50 && pct <= 0.12) {
    return "micro_accent";
  }

  return "body";
}

function buildVisualZones(colors = []) {
  const sorted = [...colors].sort(
    (a, b) => Number(b?.importance?.visual_weight || 0) - Number(a?.importance?.visual_weight || 0)
  );

  return {
    dominant: sorted[0] || null,
    secondary: sorted[1] || null,
    highlight: sorted.find((c) => c.importance?.highlight_strength > 50) || null,
    shadow: sorted.find((c) => c.importance?.shadow_strength > 50) || null,
    accent: sorted.find((c) => c.importance?.accent_strength > 50) || null,
  };
}

function separateGraphicVsBody(colors = [], dominantHex = null) {
  const body = [];
  const detail = [];

  for (const c of colors) {
    const role = classifySurfaceRole(c, dominantHex);

    const item = {
      hex: c.hex,
      name: c.name,
      pct: c.pct,
      surface_role: role,
    };

    if (role === "graphic_detail" || role === "micro_accent") {
      detail.push(item);
    } else {
      body.push(item);
    }
  }

  return {
    body_colors: body,
    detail_colors: detail,
  };
}

function deriveDominantReadOrder(colors = [], dominantHex = null) {
  const ranked = colors
    .map((c) => {
      const weight = Number(c?.importance?.visual_weight || 0);
      const contrast = Number(c?.importance?.contrast_potential || 0);
      const pct = Number(c?.pct || 0);

      let score = weight * 0.5 + contrast * 0.3 + pct * 40;

      return {
        hex: c.hex,
        name: c.name,
        score,
      };
    })
    .sort((a, b) => b.score - a.score);

  return {
    first: ranked[0] || null,
    second: ranked[1] || null,
    third: ranked[2] || null,
  };
}

function buildVisualIntelligence({ dominantHex, normalizedColors = [], colorRoles = [] }) {
  const zones = buildVisualZones(normalizedColors);
  const bodyVsDetail = separateGraphicVsBody(normalizedColors, dominantHex);
  const readOrder = deriveDominantReadOrder(normalizedColors, dominantHex);

  const dominantBody =
    bodyVsDetail.body_colors[0] || readOrder.first || null;

  return {
    dominant_visual_read: readOrder.first,
    dominant_body_color: dominantBody,
    visual_zones: zones,
    body_vs_detail: bodyVsDetail,
    dominant_read_order: readOrder,
    composition_summary: dominantBody
      ? `${dominantBody.name} is driving the main visual read`
      : "No clear dominant visual read",
  };
}
/* =========================
   GARMENT ZONE SCAFFOLD
========================= */

function buildZoneCandidate(color, zone, score) {
  if (!color?.hex) return null;

  return withColorIdentity({
    zone,
    hex: color.hex,
    name: color.name || getColorName(color.hex),
    pct: round2(color.pct || 0),
    score: Math.round(score || 0),
    structural_role: color.structural_role || "body",
    surface_role: classifySurfaceRole(color),
    family: color.family || classifyColorV2(color.hex).family,
    importance: color.importance || null,
  });
}

function buildSegmentedColorObject({
  color,
  zone,
  role,
  sourceType = "global_palette",
  segmentLabel = null,
  confidence = 0,
}) {
  const safe = safeHex(color?.hex);
  if (!safe) return null;

  const lab = getLab(safe);
  const hsl = chroma(safe).hsl();

  return withColorIdentity({
    hex: safe,
    name: getColorName(safe),
    LAB: {
      l: round2(lab.l),
      a: round2(lab.a),
      b: round2(lab.b),
    },
    perceptual_traits: getPerceptualTraits(safe),
    HSL: {
      h: round2(Number.isFinite(hsl?.[0]) ? hsl[0] : 0),
      s: round2(hsl?.[1] || 0),
      l: round2(hsl?.[2] || 0),
    },
    role: role || "body",
    zone: zone || "unknown",
    confidence: Math.round(clamp100(confidence || 0)),
    source_type: sourceType,
    segment_label: segmentLabel || zone || "unknown",
    pct: round2(color?.pct || 0),
  });
}

function getBlackNuanceLabel(hex) {
  const perceptualName = getColorName(hex);
  if (/Brown|Umber|Cognac|Espresso|Olive|Navy|Green|Blue|Purple|Red/i.test(perceptualName)) {
    return perceptualName;
  }
  const light = getLight(hex);
  if (light < 0.12) return "Jet Black";
  if (light < 0.18) return "Deep Black";
  return "Graphite Black";
}


function buildConfidenceBreakdown({
  sourceConfidence = 0,
  regionCoverage = 0,
  weightedRegionConfidence = 0,
  colorCount = 0,
  dominantPct = 0,
  clusterCount = 0,
  multicolorDetected = false,
  suppressionGates = {},
  computedScore = 0,
  finalConfidence = 0,
} = {}) {
  return {
    source_confidence: Math.round(clamp100(Number(sourceConfidence || 0))),
    region_coverage: round2(Number(regionCoverage || 0)),
    weighted_region_confidence: round2(Number(weightedRegionConfidence || 0)),
    color_count: Number(colorCount || 0),
    dominant_pct: round2(Number(dominantPct || 0)),
    cluster_count: Number(clusterCount || 0),
    multicolor_detected: Boolean(multicolorDetected),
    suppression_gates: suppressionGates || {},
    computed_score: Math.round(clamp100(Number(computedScore || 0))),
    final_confidence: Math.round(clamp100(Number(finalConfidence || 0))),
  };
}

function hasExplicitColorOwnership(color = {}) {
  const state = String(color?.ownership_state || color?.ownership || "").toLowerCase();
  return color?.ownership_validated === true && ["owned", "outfit", "positive", "confirmed"].includes(state);
}

function hasSpatialGarmentOwnership(zoneKey, color = {}) {
  const source = String(color?.source || color?.measurement_source || "");
  const bodyShare = Number(color?.body_share);
  const spatialPenalty = Number(color?.spatial_penalty);
  if (!Number.isFinite(bodyShare) || !Number.isFinite(spatialPenalty)) return false;
  if (zoneKey === "upper_garment" && source === "upper_garment_purity_v1") {
    const boundaryShare = Number(color?.boundary_share);
    const underarmShare = Number(color?.underarm_share);
    return Number.isFinite(boundaryShare) && Number.isFinite(underarmShare) &&
      bodyShare >= 0.45 && boundaryShare <= 0.42 && underarmShare <= 0.28 && spatialPenalty >= 0.8;
  }
  if (zoneKey === "lower_garment" && source === "lower_garment_purity_v2") {
    const separatorShare = Number(color?.separator_share);
    return Number.isFinite(separatorShare) &&
      bodyShare >= 0.45 && separatorShare <= 0.32 && spatialPenalty >= 0.8;
  }
  return false;
}

function isMateriallyDistinctGarmentColor(primaryHex, secondaryHex) {
  const primary = safeHex(primaryHex || "");
  const secondary = safeHex(secondaryHex || "");
  if (!primary || !secondary) return false;
  const labDistance = colorDistanceLab(primary, secondary);
  if (labDistance < 18) return false;

  const hueSeparation = hueDistance(primary, secondary);
  const saturationSeparation = Math.abs(getSat(primary) - getSat(secondary));
  const lightnessSeparation = Math.abs(getLight(primary) - getLight(secondary));
  const primaryNeutral = getSat(primary) < 0.14;
  const secondaryNeutral = getSat(secondary) < 0.14;

  // Same-direction chromatic shades are illumination/tone evidence, not proof
  // of a second material. Neutral-vs-chromatic contrast or a strong neutral
  // lightness split can still establish a genuinely distinct material.
  return (
    hueSeparation >= 18 ||
    saturationSeparation >= 0.25 ||
    (getLight(secondary) - getLight(primary) >= 0.32) ||
    (primaryNeutral !== secondaryNeutral && Math.max(getSat(primary), getSat(secondary)) >= 0.25 && lightnessSeparation >= 0.16) ||
    (primaryNeutral && secondaryNeutral && lightnessSeparation >= 0.28)
  );
}

function isSpatiallyRepeatedGarmentColor(primaryHex, color = {}) {
  const secondaryHex = safeHex(color?.hex || color?.base || "");
  return Boolean(
    secondaryHex &&
    color?.pattern_repetition_supported === true &&
    Number(color?.pct || 0) >= 0.025 &&
    colorDistanceLab(primaryHex, secondaryHex) >= 6
  );
}

function matchesOtherGarmentPrimary(primaryHex, secondaryHex, otherGarmentPrimaryHexes = []) {
  const primary = safeHex(primaryHex || "");
  const secondary = safeHex(secondaryHex || "");
  if (!primary || !secondary) return false;
  const primaryDistance = colorDistanceLab(primary, secondary);
  return (Array.isArray(otherGarmentPrimaryHexes) ? otherGarmentPrimaryHexes : []).some((hex) => {
    const otherPrimary = safeHex(hex || "");
    if (!otherPrimary) return false;
    const otherDistance = colorDistanceLab(otherPrimary, secondary);
    return otherDistance <= 12 && otherDistance + 8 < primaryDistance;
  });
}

function buildGarmentPublicationAuthorityV1(zoneKey, zoneData = {}, regionColors = [], context = {}) {
  if (!isGarmentZoneKey(zoneKey)) {
    return { applied: false, palette: regionColors, owned_secondary_count: 0 };
  }

  const dominantHex = safeHex(zoneData?.hex || "");
  const rows = (Array.isArray(regionColors) ? regionColors : []).filter((color) => safeHex(color?.hex || color?.base || ""));
  const intrinsic = rows.find((color) => color?.intrinsic_material_identity === true);
  const primary = intrinsic || rows.find((color) => dominantHex && colorDistanceLab(color?.hex || color?.base, dominantHex) < 6) || rows[0] || zoneData;
  const primaryHex = safeHex(primary?.hex || primary?.base || dominantHex || "");
  let suppressedCrossZonePrimaryCount = 0;
  let suppressedOwnedPiecePrimaryCount = 0;
  const ownedSecondaries = rows.filter((color) => {
    const hex = safeHex(color?.hex || color?.base || "");
    if (!hex || !primaryHex || (!isMateriallyDistinctGarmentColor(primaryHex, hex) && !isSpatiallyRepeatedGarmentColor(primaryHex, color))) return false;
    if (matchesOtherGarmentPrimary(primaryHex, hex, context?.otherGarmentPrimaryHexes)) {
      suppressedCrossZonePrimaryCount += 1;
      return false;
    }
    if (matchesOtherGarmentPrimary(primaryHex, hex, context?.otherOwnedPiecePrimaryHexes)) {
      suppressedOwnedPiecePrimaryCount += 1;
      return false;
    }
    return hasExplicitColorOwnership(color) || hasSpatialGarmentOwnership(zoneKey, color);
  });

  const palette = primaryHex ? [{ ...primary, hex: primaryHex }, ...ownedSecondaries] : rows;
  return {
    applied: true,
    palette,
    primary_hex: primaryHex,
    owned_secondary_count: ownedSecondaries.length,
    raw_color_count: rows.length,
    suppressed_unowned_color_count: Math.max(0, rows.length - palette.length),
    suppressed_cross_zone_primary_count: suppressedCrossZonePrimaryCount,
    suppressed_owned_piece_primary_count: suppressedOwnedPiecePrimaryCount,
    raw_evidence_is_diagnostic_only: true,
  };
}

function inferZoneColorRead(zoneKey, zoneData, normalizedColors = [], regionColors = [], useRegionOnly = false, context = {}) {
  const fallbackName = zoneData?.name || titleCase(String(zoneKey || "unknown").replace(/_/g, " "));
  const debugContext = {
    zone_color_source: context?.zoneColorSource || (regionColors.length ? "cluster" : "fallback"),
    preserved_dino_hex: safeHex(context?.preservedDinoHex || "") || null,
    suppression_gates: {
      lowSignalRegion: false,
      isWeakDominantEvidence: false,
      isNeutralContamination: false,
      footwearSignalWeak: false,
      jewelrySkinContamination: false,
    },
    strong_signal_overrides: {
      eyewearStrongSignal: false,
      furTrimStrongSignal: false,
    },
    unknown_reason: null,
    multicolor_detected: false,
    multicolor_reason: null,
    meaningful_color_count: 0,
    multicolor_source: null,
    raw_dino_meaningful_color_count: 0,
    raw_dino_multicolor_reason: null,
    filtered_cluster_count: 0,
    accessory_jewelry_identity_trace: null,
    preserveDinoZoneColor: Boolean(context?.preserveDinoZoneColor),
    preservedDinoHex: safeHex(context?.preservedDinoHex || "") || null,
    dominant: { base: null },
    dominantCluster: { base: null },
    dominantReadCluster: { base: null },
    dominantColor: { hex: null },
    primaryColor: { hex: null },
    dominant_color_selection: {
      preserved_dino_hex: null,
      selected_cluster_hex: null,
      matched_preserved_cluster: false,
      reason: null,
    },
    dino_primary_region_selection: context?.dinoPrimaryRegionSelection || null,
  };
  const contextEvidence = context?.evidence || {};
  const sourceConfidence = Number(zoneData?.confidence || 0);
  const computedScoreForBreakdown = Number(zoneData?.score || 0);

  if (!zoneData?.hex) {
    debugContext.unknown_reason = "zone_data_missing_hex";
    return {
      mode: "single",
      cluster_count: 0,
      interpretation: "unknown",
      display_label: fallbackName,
      color_mode: "single_color",
      dominant_color: null,
      primary_color: null,
      support_colors: [],
      secondary_colors: [],
      accent_colors: [],
      region_colors: [],
      evidence_summary: "No reliable color evidence for this zone.",
      confidence: 0,
      confidence_breakdown: buildConfidenceBreakdown({
        sourceConfidence,
        regionCoverage: contextEvidence.coverage,
        weightedRegionConfidence: contextEvidence.weighted_confidence,
        colorCount: contextEvidence.color_count || regionColors.length,
        computedScore: computedScoreForBreakdown,
        finalConfidence: 0,
        suppressionGates: debugContext.suppression_gates,
      }),
      _debug: debugContext,
    };
  }
  if (zoneKey === "eyewear" && !regionColors.length) {
    debugContext.unknown_reason = "eyewear_requires_region_colors";
    return {
      mode: "single",
      cluster_count: 0,
      interpretation: "unknown",
      display_label: fallbackName,
      color_mode: "single_color",
      dominant_color: null,
      primary_color: null,
      support_colors: [],
      secondary_colors: [],
      accent_colors: [],
      region_colors: [],
      evidence_summary: "No reliable color evidence for this zone.",
      confidence: 0,
      confidence_breakdown: buildConfidenceBreakdown({
        sourceConfidence,
        regionCoverage: contextEvidence.coverage,
        weightedRegionConfidence: contextEvidence.weighted_confidence,
        colorCount: contextEvidence.color_count || regionColors.length,
        computedScore: computedScoreForBreakdown,
        finalConfidence: 0,
        suppressionGates: debugContext.suppression_gates,
      }),
      _debug: debugContext,
    };
  }

  const garmentPublicationAuthority = buildGarmentPublicationAuthorityV1(zoneKey, zoneData, regionColors, context);
  if (garmentPublicationAuthority.applied) {
    regionColors = garmentPublicationAuthority.palette;
    debugContext.garment_publication_authority_v1 = garmentPublicationAuthority;
  }

  const accessoryDinoRegionColors = isAccessoryDinoPaletteZone(zoneKey) && Array.isArray(context?.selectedDinoRegionColors)
    ? context.selectedDinoRegionColors
    : [];
  const accessoryDinoDetectedPalette = accessoryDinoRegionColors.length
    ? buildAccessoryDinoDetectedPalette(accessoryDinoRegionColors)
    : [];
  const baseHex = safeHex(zoneData.hex) || zoneData.hex;
  const candidateColors = regionColors.length ? regionColors : useRegionOnly ? [] : normalizedColors;
  const zoneColors = candidateColors.filter((c) => {
    if (!c?.hex || !baseHex) return false;
    if (garmentPublicationAuthority.applied) return true;
    const dist = colorDistanceLab(c.hex, baseHex);
    if (dist < 14) return true;
    if (Number(c?.pct || 0) >= 0.18 && dist < 20) return true;
    return false;
  });

  const fallbackSet = useRegionOnly && !regionColors.length ? [zoneData] : zoneColors.length ? zoneColors : [zoneData];
  const clusters = buildColorClusters(fallbackSet);
  debugContext.filtered_cluster_count = clusters.length;
  const regionCoverage = clamp01(regionColors.reduce((sum, c) => sum + Number(c?.pct || 0), 0));
  const lowSignalRegion =
    useRegionOnly &&
    regionCoverage < 0.3 &&
    clusters.length < 2 &&
    !garmentPublicationAuthority.applied;
  const sortedByLight = clusters.slice().sort((a, b) => getLight(a.base) - getLight(b.base));
  const darkestCluster = sortedByLight[0];
  const lightestCluster = sortedByLight[sortedByLight.length - 1];
  const darkLightContrast = darkestCluster && lightestCluster
    ? Math.abs(getLight(lightestCluster.base) - getLight(darkestCluster.base))
    : 0;
  const eyewearStrongSignal =
    zoneKey === "eyewear" &&
    clusters.length >= 2 &&
    darkLightContrast >= 0.2 &&
    Number(darkestCluster?.pct || 0) >= 0.18 &&
    Number(lightestCluster?.pct || 0) >= 0.1;
  const furTrimStrongSignal =
    zoneKey === "fur_trim" &&
    clusters.length >= 2 &&
    darkLightContrast >= 0.38 &&
    Number(darkestCluster?.pct || 0) >= 0.14 &&
    Number(lightestCluster?.pct || 0) >= 0.14;
  debugContext.strong_signal_overrides.eyewearStrongSignal = eyewearStrongSignal;
  debugContext.strong_signal_overrides.furTrimStrongSignal = furTrimStrongSignal;
  const clustersTotalWeight = clusters.reduce((sum, c) => sum + Number(c?.weight || 0), 0) || 1;
  const scoredClusters = clusters
    .map((cluster, index) => {
      const traits = getPerceptualTraits(cluster.base);
      const light = getLight(cluster.base);
      const sat = getSat(cluster.base);
      const contrastBoost = Math.max(0, light - 0.45) * 0.12 + Math.max(0, sat - 0.2) * 0.12;
      const chromaBoost = Math.max(0, (Number(traits?.chroma_magnitude || 0) - 18) / 100);
      const anchorBoost = index === 0 ? 0.08 : 0;
      const sameAsUpper =
        context?.dominantDarkBodyHex &&
        colorDistanceLab(cluster.base, context.dominantDarkBodyHex) < 9 &&
        getLight(cluster.base) < 0.36 &&
        Number(traits?.chroma_magnitude || 0) < 26;
      const reusePenaltyZones = ["hair", "eyewear", "fur_trim"];
      const reusePenalty =
        reusePenaltyZones.includes(zoneKey) &&
        sameAsUpper &&
        (!regionColors.length || regionCoverage < 0.62 || Number(cluster?.pct || 0) < 0.45)
          ? 0.2
          : 0;
      return {
        ...cluster,
        _score: Number(cluster?.pct || 0) + contrastBoost + chromaBoost + anchorBoost - reusePenalty,
      };
    })
    .sort((a, b) => b._score - a._score);
  const dominantCluster = scoredClusters[0] || clusters[0] || null;
  const preservedDinoHex = safeHex(context?.preservedDinoHex || "");
  const preservedDinoCluster = preservedDinoHex
    ? clusters.find((c) => colorDistanceLab(c.base, preservedDinoHex) < 3)
    : null;
  debugContext.preservedDinoHex = preservedDinoHex || null;
  debugContext.dominantCluster = { base: dominantCluster?.base || null };
  const dominant = {
    base: preservedDinoHex || dominantCluster?.base || baseHex,
    pct: round2(
      preservedDinoCluster
        ? (Number(preservedDinoCluster?.weight || 0) || 1) / clustersTotalWeight
        : (Number(dominantCluster?.weight || 0) || 1) / clustersTotalWeight
    ),
  };
  debugContext.dominant = { base: dominant?.base || null };
  const dominantTraits = getPerceptualTraits(dominant.base);
  const isWeakDominantEvidence = Number(dominant?.pct || 0) < 0.25;
  const isNeutralContamination =
    Number(dominantTraits?.chroma_magnitude || 0) < 18 &&
    Number(dominant?.pct || 0) < 0.35 &&
    regionCoverage < 0.65;
  const sameFamilyCount = clusters.filter((c) => {
    const dominantHue = getHue(dominant.base);
    const cHue = getHue(c.base);
    const hueClose = hueDistance(dominant.base, c.base) <= 30;
    const bothNeutral = getSat(dominant.base) < 0.18 && getSat(c.base) < 0.18;
    const sameWarmth = Math.abs(dominantHue - cHue) <= 45;
    return hueClose || bothNeutral || sameWarmth;
  }).length;
  const footwearSignalWeak =
    zoneKey === "footwear" &&
    sameFamilyCount < 2 &&
    regionCoverage < 0.55;
  const jewelrySkinContamination =
    zoneKey === "accessory_jewelry" &&
    (() => {
      const hue = getHue(dominant.base);
      const sat = getSat(dominant.base);
      const light = getLight(dominant.base);
      const skinLike = hue >= 12 && hue <= 55 && sat >= 0.12 && sat <= 0.55 && light >= 0.32 && light <= 0.86;
      const highlightLike = light >= 0.8 && sat < 0.22;
      return (skinLike || highlightLike) && Number(dominant?.pct || 0) < 0.58;
    })();
  debugContext.suppression_gates.lowSignalRegion = lowSignalRegion;
  debugContext.suppression_gates.isWeakDominantEvidence = isWeakDominantEvidence;
  debugContext.suppression_gates.isNeutralContamination = isNeutralContamination;
  debugContext.suppression_gates.footwearSignalWeak = footwearSignalWeak;
  debugContext.suppression_gates.jewelrySkinContamination = jewelrySkinContamination;

  if (
    (lowSignalRegion && !eyewearStrongSignal && !furTrimStrongSignal) ||
    (isWeakDominantEvidence && !eyewearStrongSignal && !furTrimStrongSignal) ||
    (isNeutralContamination && !eyewearStrongSignal && !furTrimStrongSignal) ||
    footwearSignalWeak ||
    jewelrySkinContamination
  ) {
    debugContext.unknown_reason =
      lowSignalRegion && !eyewearStrongSignal && !furTrimStrongSignal
        ? "lowSignalRegion"
        : isWeakDominantEvidence && !eyewearStrongSignal && !furTrimStrongSignal
          ? "isWeakDominantEvidence"
          : isNeutralContamination && !eyewearStrongSignal && !furTrimStrongSignal
            ? "isNeutralContamination"
            : footwearSignalWeak
              ? "footwearSignalWeak"
              : jewelrySkinContamination
                ? "jewelrySkinContamination"
                : "suppressed_by_unknown_gate";
    return {
      mode: "single",
      cluster_count: clusters.length,
      interpretation: "unknown",
      display_label: fallbackName,
      color_mode: "single_color",
      dominant_color: null,
      primary_color: null,
      support_colors: [],
      secondary_colors: [],
      accent_colors: [],
      region_colors: clusters.map((c) => compactRegionColor({ hex: c.base, pct: c.pct })).filter(Boolean),
      evidence_summary: buildEvidenceSummary("single_color", clusters, debugContext.zone_color_source),
      confidence: Math.round(clamp100(Number(zoneData?.score || 0) * 0.4)),
      confidence_breakdown: buildConfidenceBreakdown({
        sourceConfidence,
        regionCoverage: contextEvidence.coverage || regionCoverage,
        weightedRegionConfidence: contextEvidence.weighted_confidence,
        colorCount: contextEvidence.color_count || regionColors.length,
        dominantPct: dominant?.pct,
        clusterCount: clusters.length,
        multicolorDetected: debugContext.multicolor_detected,
        suppressionGates: debugContext.suppression_gates,
        computedScore: computedScoreForBreakdown,
        finalConfidence: Math.round(clamp100(Number(zoneData?.score || 0) * 0.4)),
      }),
      _debug: debugContext,
    };
  }

  let displayLabel = getColorName(dominant.base);
  let mode = "single";
  let interpretation = "single_color";
  const pctSortedClusters = clusters.slice().sort((a, b) => Number(b?.pct || 0) - Number(a?.pct || 0));
  const meaningfulThreshold = zoneKey === "footwear" ? 0.06 : 0.08;
  const meaningfulClusters = pctSortedClusters.filter((c) => Number(c?.pct || 0) >= meaningfulThreshold);
  const topPct = Number(pctSortedClusters?.[0]?.pct || 0);
  const secondPct = Number(pctSortedClusters?.[1]?.pct || 0);
  const footwearMulticolorSignal =
    zoneKey === "footwear" &&
    meaningfulClusters.length >= 3 &&
    meaningfulThreshold === 0.06;
  const generalMulticolorSignal = meaningfulClusters.length >= 3 && meaningfulThreshold === 0.08;
  const zoneColorModeRead = getZoneColorMode(pctSortedClusters);
  const balancedTwoPlusSignal = topPct < 0.55 || secondPct >= 0.18;
  const preserveDominantAccessoryIdentity = shouldPreserveDominantAccessoryColor(zoneKey, pctSortedClusters);
  const multicolorReason = preserveDominantAccessoryIdentity ? null : zoneColorModeRead.reason;
  const multicolorDetected = !!multicolorReason;
  debugContext.preserve_dominant_accessory_identity = preserveDominantAccessoryIdentity;
  debugContext.multicolor_detected = multicolorDetected;
  debugContext.multicolor_reason = multicolorReason;
  debugContext.meaningful_color_count = meaningfulClusters.length;
  const isDinoPreservedZone =
    context?.zoneColorSource === "dino_primary" ||
    !!safeHex(context?.preservedDinoHex || "") ||
    context?.preserveDinoZoneColor === true;
  const rawDinoClusters = isDinoPreservedZone ? buildRawDinoColorClusters(accessoryDinoRegionColors.length ? accessoryDinoRegionColors : regionColors) : [];
  const rawDinoMeaningfulThreshold = 0.08;
  const rawDinoMeaningfulClusters = rawDinoClusters.filter((c) => Number(c?.pct || 0) >= rawDinoMeaningfulThreshold);
  const rawDinoColorModeRead = getZoneColorMode(rawDinoClusters);
  const rawDinoTopPct = rawDinoColorModeRead.topPct;
  const rawDinoSecondPct = rawDinoColorModeRead.secondPct;
  const rawDinoMulticolorReason =
    isDinoPreservedZone &&
    (isGarmentZoneKey(zoneKey) || zoneKey === "footwear") &&
    (!isGarmentZoneKey(zoneKey) || garmentPublicationAuthority.owned_secondary_count > 0) &&
    rawDinoColorModeRead.reason
      ? `raw_dino_${rawDinoColorModeRead.reason}`
      : null;
  const rawDinoMulticolorDetected = !!rawDinoMulticolorReason;
  debugContext.raw_dino_meaningful_color_count = rawDinoMeaningfulClusters.length;
  debugContext.raw_dino_multicolor_reason = rawDinoMulticolorReason;
  if (rawDinoMulticolorDetected) {
    debugContext.multicolor_detected = true;
    debugContext.multicolor_reason = rawDinoMulticolorReason;
    debugContext.multicolor_source = "raw_dino_region_colors";
  }
  const evidenceCoverage = clusters.reduce((sum, c) => sum + Number(c?.pct || 0), 0);

  if (
    zoneKey === "lower_garment" &&
    clusters.length >= 2 &&
    evidenceCoverage >= 0.55 &&
    clusters.some((c) => {
      const h = getHue(c.base);
      return h >= 200 && h <= 245;
    }) &&
    clusters.filter((c) => {
      const h = getHue(c.base);
      return h >= 190 && h <= 255;
    }).length >= 2 &&
    clusters.every((c) => {
      const traits = getPerceptualTraits(c.base);
      const l = getLight(c.base);
      return traits.chroma_magnitude < 42 && l > 0.2;
    })
  ) {
    displayLabel = "Light Wash Denim";
    mode = "washed_fabric";
    interpretation = "denim";
  } else if ((multicolorDetected || rawDinoMulticolorDetected) && zoneKey === "footwear") {
    const preciseFootwearText = String([
      context?.dinoPrimaryRegionSelection?.selected_label,
      context?.dinoPrimaryRegionSelection?.selected_display_zone_label,
      context?.dinoPrimaryRegionSelection?.selected_accessory_type,
    ].filter(Boolean).join(" ")).toLowerCase();
    const explicitlySneaker = /(^|\s)sneakers?(\s|$)/.test(preciseFootwearText) && preciseFootwearText.trim() !== "shoes sneakers";
    displayLabel = explicitlySneaker ? "Multicolor Sneaker" : "Multicolor Footwear";
    mode = "multicolor";
    interpretation = "multi_material";
  } else if (multicolorDetected && ["accessory_jewelry", "bag", "eyewear"].includes(zoneKey)) {
    displayLabel = "Multicolor Accessory";
    mode = "multicolor";
    interpretation = "patterned";
  } else if (
    (multicolorDetected || rawDinoMulticolorDetected) &&
    ["upper_garment", "lower_garment", "outerwear", "body_garment"].includes(zoneKey)
  ) {
    displayLabel = "Multicolor Garment";
    mode = "multicolor";
    interpretation = "multi_material";
  } else if (["accessory_jewelry", "bag", "eyewear"].includes(zoneKey) && clusters.length >= 2) {
    const top = scoredClusters[0] || clusters[0];
    const second = scoredClusters[1] || clusters[1];
    const topTraits = getPerceptualTraits(top?.base || dominant.base);
    const secondTraits = second ? getPerceptualTraits(second.base) : null;
    const lightContrast = second ? Math.abs(getLight(top.base) - getLight(second.base)) : 0;
    const chromaSpread = second
      ? Math.abs(Number(topTraits?.chroma_magnitude || 0) - Number(secondTraits?.chroma_magnitude || 0))
      : 0;
    const reflectiveMix =
      Number(topTraits?.chroma_magnitude || 0) < 24 &&
      (lightContrast > 0.2 || chromaSpread > 16) &&
      Number(second?.pct || 0) >= 0.18;
    if (reflectiveMix) {
      displayLabel = "Metallic";
      mode = "reflective";
      interpretation = "metallic";
    }
  } else if (zoneKey === "fur_trim" && clusters.length >= 2) {
    const darkest = sortedByLight[0];
    const lightest = sortedByLight[sortedByLight.length - 1];
    const lightDiff = darkLightContrast;
    const dualMaterialSignal =
      clusters.length >= 2 &&
      lightDiff > 0.36 &&
      Number(darkest?.pct || 0) >= 0.14 &&
      Number(lightest?.pct || 0) >= 0.14;
    if (dualMaterialSignal) {
      displayLabel = "Black/White Fur";
      mode = "multicolor";
      interpretation = "multi_material";
    }
  } else if (zoneKey === "eyewear") {
    const top = scoredClusters[0] || clusters[0];
    const second = scoredClusters[1] || clusters[1];
    const hasReflectiveEdge =
      !!second &&
      Math.abs(getLight(top.base) - getLight(second.base)) >= 0.22 &&
      Number(second?.pct || 0) >= 0.12;
    const topVeryDark = getLight(top.base) < 0.3;
    if (topVeryDark && hasReflectiveEdge) {
      displayLabel = getSat(top.base) < 0.12 ? "Black Metal" : "Metallic";
      mode = "reflective";
      interpretation = "metallic";
    } else if (!isNavyCandidate(top.base) && getLight(top.base) < 0.34) {
      displayLabel = getBlackNuanceLabel(top.base);
    }
  }

  if (zoneKey === "hair" && !isNavyCandidate(dominant.base) && getLight(dominant.base) < 0.26) {
    displayLabel = getLight(dominant.base) < 0.14 ? "Jet Black" : "Deep Black";
  }

  if (
    ["upper_garment", "lower_garment", "outerwear", "body_garment"].includes(zoneKey) &&
    !isNavyCandidate(dominant.base) &&
    !isDarkOliveFamily(dominant.base) &&
    getLight(dominant.base) < 0.28 &&
    Number(dominantTraits?.chroma_magnitude || 0) < 18
  ) {
    displayLabel = getBlackNuanceLabel(dominant.base);
  }

  const zoneConfidence = Math.round(
    clamp100(Number(zoneData?.score || 0) * 0.55 + Number(zoneData?.confidence || 0) * 0.45)
  );
  const useRawDinoMulticolorRead =
    !isGarmentZoneKey(zoneKey) &&
    !preserveDominantAccessoryIdentity &&
    mode === "multicolor" &&
    rawDinoMulticolorDetected &&
    rawDinoMeaningfulClusters.length;
  const colorReadClusters = useRawDinoMulticolorRead
    ? rawDinoMeaningfulClusters
    : mode === "multicolor" && meaningfulClusters.length
      ? meaningfulClusters
      : clusters;
  const shouldPreferPreservedDinoAccessoryCluster =
    context?.preserveDinoZoneColor === true &&
    !!preservedDinoHex &&
    preserveDominantAccessoryIdentity &&
    zoneKey !== "bag";
  const preservedDinoAccessoryCluster = shouldPreferPreservedDinoAccessoryCluster
    ? pctSortedClusters.find((c) => colorDistanceLab(c?.base || c?.hex, preservedDinoHex) < 3)
    : null;
  const preservedDinoDominantBaseFallback = shouldPreferPreservedDinoAccessoryCluster && !preservedDinoAccessoryCluster
    ? { base: dominant.base, pct: dominant.pct }
    : null;
  const dominantReadCluster = mode === "multicolor" && !useRawDinoMulticolorRead
    ? colorReadClusters[0] || { base: dominant.base, pct: dominant.pct }
    : preserveDominantAccessoryIdentity
      ? preservedDinoAccessoryCluster || preservedDinoDominantBaseFallback || pctSortedClusters[0] || { base: dominant.base, pct: dominant.pct }
      : { base: dominant.base, pct: dominant.pct };
  debugContext.dominantReadCluster = { base: dominantReadCluster?.base || dominantReadCluster?.hex || null };
  debugContext.dominant_color_selection = {
    preserved_dino_hex: preservedDinoHex || null,
    selected_cluster_hex: safeHex(dominantReadCluster?.base || dominantReadCluster?.hex || "") || null,
    matched_preserved_cluster: Boolean(preservedDinoAccessoryCluster),
    reason: shouldPreferPreservedDinoAccessoryCluster
      ? preservedDinoAccessoryCluster
        ? "preserved_dino_cluster_match"
        : preservedDinoDominantBaseFallback
          ? "preserved_dino_fallback_to_dominant_base"
          : "preserved_dino_cluster_missing_fallback_pct_top"
      : preserveDominantAccessoryIdentity
        ? "preserve_dominant_accessory_identity_pct_top"
        : mode === "multicolor" && !useRawDinoMulticolorRead
          ? "multicolor_primary_cluster"
          : "dominant_color_read",
  };
  const preservedAccessoryColor = preserveDominantAccessoryIdentity
    ? buildPreservedAccessoryColor(dominantReadCluster, {
        base: dominant.base,
        name: displayLabel,
        pct: dominant.pct,
      })
    : null;
  if (preservedAccessoryColor) {
    displayLabel = preservedAccessoryColor.name;
  }
  const summaryColorReadClusters = garmentPublicationAuthority.applied
    ? mergeColorSummaryFamilies(regionColors)
    : mergeClusterSummaryFamilies(colorReadClusters);
  const authoritativeGarmentPrimary = garmentPublicationAuthority.applied
    ? summaryColorReadClusters[0] || null
    : null;
  const dominantColor = preservedAccessoryColor || withColorIdentity({
    ...(authoritativeGarmentPrimary || {}),
    hex: authoritativeGarmentPrimary?.hex || dominantReadCluster.base,
    name: authoritativeGarmentPrimary?.name || getColorName(dominantReadCluster.base),
    pct: authoritativeGarmentPrimary?.pct ?? round2(dominantReadCluster.pct),
  });
  const supportColors = summaryColorReadClusters.slice(1, 4).map((c) => withColorIdentity({
    ...c,
    hex: c.hex,
    name: c.name,
    pct: c.pct,
  }));
  const accentColors = summaryColorReadClusters.slice(4, 6).map((c) => withColorIdentity({
    ...c,
    hex: c.hex,
    name: c.name,
    pct: c.pct,
  }));
  const summaryPrimaryColor = preservedAccessoryColor || (summaryColorReadClusters[0]
    ? withColorIdentity({
        ...summaryColorReadClusters[0],
        hex: summaryColorReadClusters[0].hex,
        name: summaryColorReadClusters[0].name,
        pct: summaryColorReadClusters[0].pct,
      })
    : dominantColor);
  const rawDinoPrimaryColor = useRawDinoMulticolorRead
    ? withColorIdentity({
        hex: colorReadClusters[0].base,
        name: getColorName(colorReadClusters[0].base),
        pct: round2(colorReadClusters[0].pct),
      })
    : null;
  const rawDinoSecondaryColors = useRawDinoMulticolorRead
    ? colorReadClusters.slice(1, 4).map((c) => withColorIdentity({
        hex: c.base,
        name: getColorName(c.base),
        pct: round2(c.pct),
      }))
    : [];
  const rawDinoAccentColors = useRawDinoMulticolorRead
    ? colorReadClusters.slice(4, 6).map((c) => withColorIdentity({
        hex: c.base,
        name: getColorName(c.base),
        pct: round2(c.pct),
      }))
    : [];

  const primaryColorRead = compactColorRead(summaryPrimaryColor);
  const rawDinoPalette = preserveAccessoryRawPalette(context?.rawDinoRegionColors || accessoryDinoRegionColors);
  const rawDetectorPalette = preserveAccessoryRawPalette(
    rawDinoPalette.length ? rawDinoPalette : (zoneData?.hex ? [{ hex: zoneData.hex, pct: zoneData.pct, name: zoneData.name }] : [])
  );
  const pixelRefinedPalette = preserveAccessoryRawPalette(context?.refinedRegionColors || []);
  const candidateRegionPalette = preserveAccessoryRawPalette(accessoryDinoRegionColors);
  const fallbackPalette = preserveAccessoryRawPalette(normalizedColors);
  const displayPaletteSelection = isAccessoryDisplayPaletteZone(zoneKey)
    ? selectAccessoryDisplayPalette({
        refinedCrop: pixelRefinedPalette,
        candidateRegion: candidateRegionPalette,
        rawDino: rawDinoPalette,
        detector: rawDetectorPalette,
        fallback: fallbackPalette,
      })
    : null;
  const displayPalette = displayPaletteSelection?.palette || [];
  const selectedDisplaySource = displayPaletteSelection?.selected_source || debugContext.zone_color_source || "fallback";
  const displayEvidenceWeight = displayPaletteEvidenceWeight(selectedDisplaySource);
  const explainabilitySourceConfidence = Number(contextEvidence?.weighted_confidence || sourceConfidence || zoneConfidence || 0);
  const calibratedDisplayPalette = displayPalette.map((color) => withDisplayColorConfidence(color, {
    zoneConfidence,
    sourceConfidence: explainabilitySourceConfidence,
    evidenceWeight: displayEvidenceWeight,
  }));
  const compactAccessoryDisplayRoles = calibratedDisplayPalette.length
    ? splitAccessoryDetectedPaletteRoles(calibratedDisplayPalette)
    : null;
  const accessoryDisplayRoles = compactAccessoryDisplayRoles
    ? {
        primary: withDisplayColorConfidence(compactAccessoryDisplayRoles.primary, {
          zoneConfidence,
          sourceConfidence: explainabilitySourceConfidence,
          evidenceWeight: displayEvidenceWeight,
        }),
        secondary: (compactAccessoryDisplayRoles.secondary || []).map((color) => withDisplayColorConfidence(color, {
          zoneConfidence,
          sourceConfidence: explainabilitySourceConfidence,
          evidenceWeight: displayEvidenceWeight,
        })),
        accent: (compactAccessoryDisplayRoles.accent || []).map((color) => withDisplayColorConfidence(color, {
          zoneConfidence,
          sourceConfidence: explainabilitySourceConfidence,
          evidenceWeight: displayEvidenceWeight,
        })),
      }
    : null;
  const contaminationScore = buildContaminationEvidenceScore({
    dominant,
    regionCoverage: contextEvidence.coverage || regionCoverage,
    suppressionGates: debugContext.suppression_gates,
  });
  debugContext.contamination_score_total = contaminationScore.total;
  debugContext.contamination_score = contaminationScore;
  const rejectedAlternatives = flattenRejectedDisplayAlternatives(displayPaletteSelection?.trace);
  const explainabilityPublishedColors = calibratedDisplayPalette.length
    ? calibratedDisplayPalette
    : summaryColorReadClusters.map((color) => withDisplayColorConfidence(color, {
        zoneConfidence,
        sourceConfidence: explainabilitySourceConfidence,
        evidenceWeight: displayEvidenceWeight,
      }));
  const explainabilityPrimary = accessoryDisplayRoles?.primary || withDisplayColorConfidence(primaryColorRead, {
    zoneConfidence,
    sourceConfidence: explainabilitySourceConfidence,
    evidenceWeight: displayEvidenceWeight,
  });
  const publicationPrimaryReason = {
    code: calibratedDisplayPalette.length ? "highest_priority_surviving_palette" : "zone_color_read_selected",
    source: selectedDisplaySource,
    selected_hex: explainabilityPrimary?.hex || dominantColor?.hex || null,
    confidence: explainabilityPrimary?.confidence ?? calibrateConfidence(zoneConfidence),
    message: calibratedDisplayPalette.length
      ? "Published the highest-priority surviving color evidence after contamination filtering."
      : "Published the finalized zone color read supported by available evidence.",
  };
  const publicationReasons = {
    primary: publicationPrimaryReason,
    supporting: [
      {
        code: "confidence_calibrated",
        zone_weight: 0.55,
        color_percentage_weight: 0.30,
        source_confidence_weight: 0.15,
        evidence_weight: round2(displayEvidenceWeight),
      },
      {
        code: "contamination_evidence_scored",
        total: contaminationScore.total,
      },
    ],
  };
  const evidenceLedger = {
    zone: zoneKey,
    source: selectedDisplaySource,
    selected_color: explainabilityPrimary,
    published_colors: explainabilityPublishedColors,
    detector_evidence: rawDetectorPalette,
    dino_evidence: rawDinoPalette,
    crop_pixel_evidence: filterAccessoryDisplayPalette(pixelRefinedPalette).kept,
    candidate_region_evidence: candidateRegionPalette,
    contamination_scores: contaminationScore,
  };
  debugContext.dominantColor = { hex: dominantColor?.hex || null };
  debugContext.primaryColor = { hex: primaryColorRead?.hex || null };
  if (zoneKey === "accessory_jewelry") {
    debugContext.accessory_jewelry_identity_trace = {
      preserveDominantAccessoryIdentity,
      dominant_color: {
        name: dominantColor?.name || null,
        color_identity_name: dominantColor?.color_identity?.name || null,
        translation: dominantColor?.color_identity?.translation || null,
      },
      primary_color: {
        name: primaryColorRead?.name || null,
        color_identity_name: primaryColorRead?.color_identity?.name || null,
        translation: primaryColorRead?.color_identity?.translation || null,
      },
      display_label: displayLabel,
      color_identity: {
        name: dominantColor?.color_identity?.name || null,
        translation: dominantColor?.color_identity?.translation || null,
      },
    };
  }

  return {
    mode,
    read_mode: mode,
    cluster_count: clusters.length,
    color_mode: mode === "multicolor" ? "multi_color" : "single_color",
    interpretation,
    pattern: debugContext.multicolor_reason === "spatially_repeated_secondary"
      ? "repeating_color_motif"
      : undefined,
    pattern_evidence_v1: debugContext.multicolor_reason === "spatially_repeated_secondary"
      ? {
          supported: true,
          source: "exclusive_mask_spatial_distribution",
          reason: debugContext.multicolor_reason,
          external_color_authority: false,
        }
      : undefined,
    display_label: displayLabel,
    confidence: zoneConfidence,
    confidence_breakdown: buildConfidenceBreakdown({
      sourceConfidence,
      regionCoverage: contextEvidence.coverage || regionCoverage,
      weightedRegionConfidence: contextEvidence.weighted_confidence,
      colorCount: contextEvidence.color_count || regionColors.length,
      dominantPct: dominant?.pct,
      clusterCount: clusters.length,
      multicolorDetected: debugContext.multicolor_detected,
      suppressionGates: debugContext.suppression_gates,
      computedScore: computedScoreForBreakdown,
      finalConfidence: zoneConfidence,
    }),
    dominant_color: dominantColor,
    color_identity_summary: buildColorIdentitySummary(dominantColor?.color_identity),
    garment_identity: isGarmentZoneKey(zoneKey) ? buildGarmentIdentity(dominantColor, supportColors) : undefined,
    primary_color: explainabilityPrimary,
    support_colors: supportColors,
    secondary_colors: accessoryDisplayRoles ? accessoryDisplayRoles.secondary : mergeColorReadSummaryFamilies(supportColors),
    accent_colors: accessoryDisplayRoles ? accessoryDisplayRoles.accent : mergeColorReadSummaryFamilies(accentColors),
    detected_colors: explainabilityPublishedColors,
    region_colors: explainabilityPublishedColors,
    raw_detector_palette: isAccessoryDisplayPaletteZone(zoneKey) ? rawDetectorPalette : undefined,
    raw_dino_palette: isAccessoryDisplayPaletteZone(zoneKey) ? rawDinoPalette : undefined,
    pixel_refined_palette: isAccessoryDisplayPaletteZone(zoneKey) ? filterAccessoryDisplayPalette(pixelRefinedPalette).kept : undefined,
    display_palette: isAccessoryDisplayPaletteZone(zoneKey) ? calibratedDisplayPalette : undefined,
    display_palette_trace: isAccessoryDisplayPaletteZone(zoneKey) ? displayPaletteSelection?.trace : undefined,
    evidence_ledger: evidenceLedger,
    publication_reasons: publicationReasons,
    publication_reason: publicationReasons.primary,
    rejected_alternatives: rejectedAlternatives,
    evidence_summary: buildEvidenceSummary(mode === "multicolor" ? "multi_color" : "single_color", colorReadClusters, useRawDinoMulticolorRead ? "raw DINO region colors" : debugContext.zone_color_source),
    ...(
      useRawDinoMulticolorRead && isGarmentZoneKey(zoneKey)
        ? {
            primary_color: compactColorRead(mergeClusterSummaryFamilies(colorReadClusters)[0] || rawDinoPrimaryColor),
            secondary_colors: rawDinoSecondaryColors.map(compactColorRead).filter(Boolean),
            accent_colors: rawDinoAccentColors.map(compactColorRead).filter(Boolean),
            color_identity_summary: buildColorIdentitySummary(rawDinoPrimaryColor?.color_identity),
            garment_identity: buildGarmentIdentity(rawDinoPrimaryColor, rawDinoSecondaryColors),
            color_story: buildColorStory(
              compactColorRead(rawDinoPrimaryColor),
              rawDinoSecondaryColors.map(compactColorRead).filter(Boolean),
              rawDinoAccentColors.map(compactColorRead).filter(Boolean)
            ),
          }
        : buildGarmentColorProfile({
            zoneKey,
            mode,
            dominantColor,
            supportColors,
            accentColors,
          })
    ),
    ...(isAccessoryDisplayPaletteZone(zoneKey) ? {
      primary_color: explainabilityPrimary,
      secondary_colors: accessoryDisplayRoles?.secondary || [],
      accent_colors: accessoryDisplayRoles?.accent || [],
      detected_colors: explainabilityPublishedColors,
      region_colors: explainabilityPublishedColors,
      display_palette: calibratedDisplayPalette,
    } : {}),
    _debug: debugContext,
  };
}


function buildHeadwearDebugValues(zoneData = {}) {
  if (zoneData?.display_zone_label !== "Headwear") return null;
  const debug = zoneData?._debug || {};
  const dinoPrimaryRegionSelection = debug?.dino_primary_region_selection || null;
  const values = {
    preserveDinoZoneColor: Boolean(debug?.preserveDinoZoneColor),
    preservedDinoHex: debug?.preservedDinoHex || debug?.preserved_dino_hex || null,
    "dominant.base": debug?.dominant?.base || null,
    "dominantCluster.base": debug?.dominantCluster?.base || null,
    "dominantReadCluster.base": debug?.dominantReadCluster?.base || null,
    "dominantColor.hex": debug?.dominantColor?.hex || zoneData?.dominant_color?.hex || null,
    "primaryColor.hex": debug?.primaryColor?.hex || zoneData?.primary_color?.hex || null,
    "dominant_color_selection.reason": debug?.dominant_color_selection?.reason || null,
  };

  return {
    ...values,
    dino_primary_region_selection: dinoPrimaryRegionSelection,
    dino_primary_region_selection_json: dinoPrimaryRegionSelection
      ? JSON.stringify(dinoPrimaryRegionSelection, null, 2)
      : null,
    ui_rows: Object.entries(values).map(([label, value]) => ({
      label,
      value: value === undefined ? null : value,
    })),
  };
}

function getZoneRegionEvidence(zoneRegions = []) {
  const coverage = (zoneRegions || []).reduce((sum, r) => sum + Number(r?.coverage || r?.confidence || 0), 0);
  const weightedConfidence = avg((zoneRegions || []).map((r) => Number(r?.confidence || 0)));
  const colorCount = (zoneRegions || []).reduce((sum, r) => {
    const local = Array.isArray(r?.region_colors) ? r.region_colors.length : 0;
    return sum + local;
  }, 0);

  return {
    region_count: zoneRegions.length,
    coverage: round2(coverage),
    weighted_confidence: round2(weightedConfidence),
    color_count: colorCount,
  };
}

function hasHighContrastColorSignal(colors = []) {
  const palette = (colors || []).map((c) => safeHex(c?.hex)).filter(Boolean);
  if (palette.length < 2) return false;
  for (let i = 0; i < palette.length; i += 1) {
    for (let j = i + 1; j < palette.length; j += 1) {
      if (Math.abs(getLight(palette[i]) - getLight(palette[j])) >= 0.33) return true;
    }
  }
  return false;
}

function hasStrongEyewearRegionSignal(zoneRegions = [], evidence = {}) {
  if (!Array.isArray(zoneRegions) || !zoneRegions.length) return false;
  const weightedConfidence = Number(evidence?.weighted_confidence || 0);
  const coverage = Number(evidence?.coverage || 0);
  const compactRegion = zoneRegions.some((r) => {
    const localCoverage = Number(r?.coverage || 0);
    return localCoverage >= 0.03 && localCoverage <= 0.24;
  });
  const hasLensLikeContrast = zoneRegi…46658 tokens truncated…tHex = existingDominantHex;
    preservedExisting = true;
    reason = "existing_top_pct_not_weaker_than_sampled";
  }

  return {
    dominantHex,
    debug: {
      existing_dominant_hex: existingDominantHex || null,
      existing_top_pct: Number.isFinite(existingTopPct) ? round2(existingTopPct) : 0,
      sampled_top_hex: sampledTopHex || null,
      sampled_top_pct: Number.isFinite(sampledTopPct) ? round2(sampledTopPct) : 0,
      preserved_existing: preservedExisting,
      reason,
    },
  };
}

function extractColorsFromDinoBboxes(imageBuffer, dinoRegions = []) {
  if (!imageBuffer || !Array.isArray(dinoRegions) || !dinoRegions.length) return dinoRegions || [];
  let baseImage;
  try {
    baseImage = decodeImageRgba(imageBuffer);
  } catch {
    return dinoRegions;
  }

  return dinoRegions.map((region) => {
    if (!region?.bbox) return region;
    const extraction = extractDinoBboxRegionColors(baseImage, region.bbox, 6, {
      zone: region?.zone,
      category: region?.category,
      label: region?.label || region?.segment_label,
      object_type: region?.object_type,
      accessory_type: region?.accessory_type,
    });
    const regionColors = extraction.colors || [];
    if (!regionColors.length) return region;
    const { dominantHex, debug: dominantHexPreservation } = chooseDinoBboxDominantHex(region, regionColors);
    return {
      ...region,
      image_dimensions: { width: baseImage.width, height: baseImage.height },
      normalized_bbox: (() => {
        const box = getPixelBboxFromDinoBbox(region.bbox, baseImage.width, baseImage.height);
        return box ? {
          x: box.x1 / baseImage.width,
          y: box.y1 / baseImage.height,
          w: box.width / baseImage.width,
          h: box.height / baseImage.height,
        } : null;
      })(),
      dominant_hex: dominantHex || null,
      region_colors: regionColors,
      color_debug: {
        ...(region?.color_debug || {}),
        dino_bbox_sampling: {
          ...extraction.debug,
          dominant_hex_preservation: dominantHexPreservation,
        },
      },
      coverage: round2(Math.max(Number(region?.coverage || 0), getDinoBboxArea(region.bbox))),
      mask_geometry: region?.mask_geometry || { bbox: region.bbox, coverage: getDinoBboxArea(region.bbox) },
    };
  });
}

function extractMaskGeometry(maskImage) {
  const maskW = Number(maskImage?.width || 0);
  const maskH = Number(maskImage?.height || 0);
  if (!maskW || !maskH) return null;
  const maskStrengthAt = createMaskStrengthReader(maskImage);

  const isOn = (x, y) => {
    if (x < 0 || y < 0 || x >= maskW || y >= maskH) return false;
    const idx = (y * maskW + x) * 4;
    return maskStrengthAt(idx) >= 25;
  };

  let onCount = 0;
  let sumX = 0;
  let sumY = 0;
  let minX = maskW;
  let minY = maskH;
  let maxX = -1;
  let maxY = -1;
  let boundaryPx = 0;
  let imageEdgePx = 0;

  for (let y = 0; y < maskH; y += 1) {
    for (let x = 0; x < maskW; x += 1) {
      if (!isOn(x, y)) continue;
      onCount += 1;
      sumX += x;
      sumY += y;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;

      const touchesImageEdge = x === 0 || y === 0 || x === maskW - 1 || y === maskH - 1;
      if (touchesImageEdge) imageEdgePx += 1;

      if (!isOn(x - 1, y) || !isOn(x + 1, y) || !isOn(x, y - 1) || !isOn(x, y + 1)) {
        boundaryPx += 1;
      }
    }
  }

  if (!onCount || maxX < minX || maxY < minY) return null;

  const bboxW = maxX - minX + 1;
  const bboxH = maxY - minY + 1;
  const bboxArea = bboxW * bboxH;

  return {
    coverage: clamp01(onCount / (maskW * maskH)),
    pixel_count: onCount,
    centroid_x: clamp01(sumX / onCount / maskW),
    centroid_y: clamp01(sumY / onCount / maskH),
    bbox: {
      x: clamp01(minX / maskW),
      y: clamp01(minY / maskH),
      w: clamp01(bboxW / maskW),
      h: clamp01(bboxH / maskH),
    },
    bbox_area: clamp01(bboxArea / (maskW * maskH)),
    aspect_ratio: bboxH > 0 ? bboxW / bboxH : 0,
    fill_ratio: bboxArea > 0 ? clamp01(onCount / bboxArea) : 0,
    boundary_ratio: onCount > 0 ? clamp01(boundaryPx / onCount) : 0,
    image_edge_ratio: onCount > 0 ? clamp01(imageEdgePx / onCount) : 0,
  };
}

function mergeNormalizedBBoxes(boxes = []) {
  const valid = (boxes || []).filter((b) => b && Number.isFinite(b.x) && Number.isFinite(b.y) && Number.isFinite(b.w) && Number.isFinite(b.h));
  if (!valid.length) return null;
  const minX = Math.max(0, Math.min(1, Math.min(...valid.map((b) => b.x))));
  const minY = Math.max(0, Math.min(1, Math.min(...valid.map((b) => b.y))));
  const maxX = Math.max(0, Math.min(1, Math.max(...valid.map((b) => b.x + b.w))));
  const maxY = Math.max(0, Math.min(1, Math.max(...valid.map((b) => b.y + b.h))));
  if (maxX <= minX || maxY <= minY) return null;
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function estimateGenericMaskZone(region = {}, context = {}) {
  const geometry = region?.mask_geometry || {};
  const bbox = geometry?.bbox || null;
  const coverage = Number(geometry?.coverage || region?.coverage || 0);
  const centroidX = Number(geometry?.centroid_x || (bbox ? bbox.x + bbox.w / 2 : 0.5));
  const centroidY = Number(geometry?.centroid_y || (bbox ? bbox.y + bbox.h / 2 : 0.5));
  const boundaryRatio = Number(geometry?.boundary_ratio || 0);
  const imageEdgeRatio = Number(geometry?.image_edge_ratio || 0);
  const fillRatio = Number(geometry?.fill_ratio || 0);
  const aspectRatio = Number(geometry?.aspect_ratio || 0);
  const colors = Array.isArray(region?.region_colors) ? region.region_colors : [];
  const hasContrast = hasHighContrastColorSignal(colors);
  const colorSet = new Set(
    colors
      .map((c) => safeHex(c?.hex || ""))
      .filter(Boolean)
  );
  const hasNontrivialRegionColors =
    colorSet.size >= 2 &&
    (Number(colors?.[0]?.pct || 0) <= 0.92 || Number(colors?.[1]?.pct || 0) >= 0.05);
  const bodyBox = context?.body_bbox || null;
  const outerBox = context?.outer_bbox || null;
  const torsoTop = bodyBox ? bodyBox.y : 0.2;
  const headCutoffY = bodyBox ? bodyBox.y + bodyBox.h * 0.32 : 0.32;
  const centerAligned = centroidX >= 0.2 && centroidX <= 0.8;
  const compact = coverage >= 0.008 && coverage <= 0.14;
  const torsoBand = centroidY >= torsoTop && centroidY <= 0.82;
  const expandsPastBody =
    !!bodyBox &&
    !!bbox &&
    (bbox.x < bodyBox.x - 0.025 ||
      bbox.x + bbox.w > bodyBox.x + bodyBox.w + 0.025 ||
      bbox.y < bodyBox.y - 0.025 ||
      bbox.y + bbox.h > bodyBox.y + bodyBox.h + 0.02);
  const nearOuterBoundary =
    !!outerBox &&
    !!bbox &&
    Math.abs((bbox.x + bbox.w / 2) - (outerBox.x + outerBox.w / 2)) <= 0.42 &&
    Math.abs((bbox.y + bbox.h / 2) - (outerBox.y + outerBox.h / 2)) <= 0.42;
  const hasBoundaryIrregularity = boundaryRatio >= 0.45 || fillRatio <= 0.72;
  const extremeCoverage = coverage > 0.75;
  const wholeBodyGarmentCandidate = extremeCoverage && torsoBand && expandsPastBody;

  let eyewearScore = 0;
  const eyewearWhy = [];
  if (compact) {
    eyewearScore += 2;
    eyewearWhy.push("compact_coverage");
  }
  if (centerAligned) {
    eyewearScore += 1.5;
    eyewearWhy.push("center_aligned");
  }
  if (centroidY <= headCutoffY) {
    eyewearScore += 2.5;
    eyewearWhy.push("upper_face_position");
  }
  if (hasContrast) {
    eyewearScore += 1;
    eyewearWhy.push("lens_like_contrast");
  }
  if (aspectRatio >= 0.35 && aspectRatio <= 3.2) eyewearScore += 0.5;

  let outerwearScore = 0;
  const outerwearWhy = [];
  if (coverage >= 0.16) {
    outerwearScore += 2;
    outerwearWhy.push("large_coverage");
  }
  if (torsoBand) {
    outerwearScore += 1.5;
    outerwearWhy.push("torso_band");
  }
  if (expandsPastBody) {
    outerwearScore += 2.5;
    outerwearWhy.push("surrounds_body_silhouette");
  }
  if (hasContrast) {
    outerwearScore += 1;
    outerwearWhy.push("material_contrast");
  }
  if (hasBoundaryIrregularity) {
    outerwearScore += 0.75;
    outerwearWhy.push("boundary_irregularity");
  }
  if (hasNontrivialRegionColors) {
    outerwearScore += 0.75;
    outerwearWhy.push("nontrivial_region_colors");
  }
  if (wholeBodyGarmentCandidate) {
    outerwearScore += 1.5;
    outerwearWhy.push("whole_body_garment_candidate");
  }

  const explicitOuterwearAcceptance =
    coverage >= 0.16 &&
    torsoBand &&
    expandsPastBody &&
    (hasContrast || hasBoundaryIrregularity || hasNontrivialRegionColors);

  let furTrimScore = 0;
  const furTrimWhy = [];
  if (coverage >= 0.01 && coverage <= 0.22) {
    furTrimScore += 1.5;
    furTrimWhy.push("trim_sized_region");
  }
  if (hasContrast) {
    furTrimScore += 1.5;
    furTrimWhy.push("light_dark_contrast");
  }
  if (boundaryRatio >= 0.45 || fillRatio <= 0.72) {
    furTrimScore += 2;
    furTrimWhy.push("irregular_boundary");
  }
  if (nearOuterBoundary || expandsPastBody) {
    furTrimScore += 1.5;
    furTrimWhy.push("near_outerwear_edge");
  }
  if (imageEdgeRatio >= 0.12) {
    furTrimScore += 0.5;
    furTrimWhy.push("image_edge_adjacent");
  }

  const ranked = [
    { zone: "eyewear", score: eyewearScore, reasons: eyewearWhy },
    { zone: "outerwear", score: outerwearScore, reasons: outerwearWhy },
    { zone: "fur_trim", score: furTrimScore, reasons: furTrimWhy },
  ].sort((a, b) => b.score - a.score);
  const top = ranked[0];
  const thresholds = {
    eyewear: 5,
    outerwear: explicitOuterwearAcceptance || wholeBodyGarmentCandidate ? 3.75 : 4.5,
    fur_trim: 4.5,
  };
  const thresholdUsed = Number(thresholds[top.zone] || 99);
  const acceptedByScore = top.score >= thresholdUsed && coverage >= 0.01;
  const acceptedByOuterwearRule = top.zone === "outerwear" && explicitOuterwearAcceptance;
  const accepted = acceptedByScore || acceptedByOuterwearRule;
  const decisionWhyAccepted = [];
  const decisionWhyRejected = [];
  if (acceptedByOuterwearRule) decisionWhyAccepted.push("explicit_outerwear_acceptance_rule");
  if (acceptedByScore) decisionWhyAccepted.push("score_meets_threshold");
  if (!accepted) {
    decisionWhyRejected.push("insufficient_contextual_fit");
    if (top.zone === "outerwear" && explicitOuterwearAcceptance === false) {
      decisionWhyRejected.push("missing_explicit_outerwear_rule_inputs");
    }
    if (top.score < thresholdUsed) {
      decisionWhyRejected.push(`score_below_threshold:${round2(top.score)}<${round2(thresholdUsed)}`);
    }
  }
  return {
    estimated_role: top.zone,
    proposed_zone: accepted ? top.zone : null,
    accepted,
    acceptance_reasons: accepted ? top.reasons : [],
    rejection_reasons: accepted ? [] : [...decisionWhyRejected, ...top.reasons.slice(0, 2)],
    scores: Object.fromEntries(ranked.map((r) => [r.zone, round2(r.score)])),
    top_score: round2(top.score),
    threshold_used: round2(thresholdUsed),
    expandsPastBody,
    nearOuterBoundary,
    body_bbox: bodyBox || null,
    bbox: bbox || null,
    decision_formula: {
      accepted_by_score: acceptedByScore,
      accepted_by_explicit_outerwear_rule: acceptedByOuterwearRule,
      explicit_outerwear_acceptance_rule: explicitOuterwearAcceptance,
      whole_body_garment_candidate: wholeBodyGarmentCandidate,
      extreme_coverage: extremeCoverage,
      accepted_why: decisionWhyAccepted,
      rejected_why: decisionWhyRejected,
    },
  };
}

async function enrichSamRegionsWithMaskedColors(imageUrl, regions = []) {
  if (!imageUrl || !Array.isArray(regions) || !regions.length) return regions || [];

  let baseImage;
  try {
    const baseBuffer = await fetchImageBuffer(imageUrl);
    baseImage = decodeImageRgba(baseBuffer, imageUrl);
  } catch {
    return regions;
  }

  const decodedMasks = await Promise.all(regions.map(async (region) => {
    if (!region?.mask_url) return null;
    try {
      const maskBuffer = await fetchImageBuffer(region.mask_url);
      const maskImage = decodeImageRgba(maskBuffer, region.mask_url);
      return {
        region,
        maskImage,
        geometry: extractMaskGeometry(maskImage),
        strengthReader: createMaskStrengthReader(maskImage),
      };
    } catch {
      return null;
    }
  }));
  const availableMasks = decodedMasks.filter(Boolean);

  return regions.map((region, index) => {
    const decoded = decodedMasks[index];
    if (!decoded) return region;
    const semanticInstanceKey = region?.target_conditioned_mask_v1?.semantic_instance_key || null;
    const competitors = availableMasks.filter((candidate) => {
      if (candidate === decoded || !candidate.region?.zone || candidate.region.zone === "unknown") return false;
      if (candidate.region.zone !== region?.zone) return true;
      const candidateSemanticInstanceKey = candidate.region?.target_conditioned_mask_v1?.semantic_instance_key || null;
      return Boolean(semanticInstanceKey && candidateSemanticInstanceKey && semanticInstanceKey !== candidateSemanticInstanceKey);
    });
    const measuredColors = measureMaskedRegionColors(baseImage, decoded.maskImage, {
      target: decoded,
      competitors,
    });
    // Consolidate the entire owned mask before limiting the palette. Limiting
    // raw RGB buckets first erases distributed pattern colors whose combined
    // mass is meaningful (for example a taupe monogram over dark brown).
    const regionColors = aggregateMeasuredMaskColorsV1(measuredColors, 6);
    const dominantHex = safeHex(regionColors[0]?.hex || region?.dominant_hex || "");
    const totalOwnedPixelCount = Number(regionColors[0]?.total_owned_pixel_count || 0);

    return {
      ...region,
      coverage: round2(Math.max(Number(region?.coverage || 0), Number(decoded.geometry?.coverage || 0))),
      dominant_hex: dominantHex || region?.dominant_hex || null,
      region_colors: regionColors,
      illumination_remeasurement_candidates_v1: measuredColors.slice(0, 32).map((color) => ({
        ...color,
        source: "exclusive_mask_pixel_membership",
        measurement_source: "exclusive_mask_pixel_membership",
        ownership_state: "owned",
        ownership_validated: true,
        traceable_to_pixels: true,
      })),
      owned_pixel_count: totalOwnedPixelCount,
      mask_geometry: decoded.geometry,
      mask_color_ownership_v1: {
        applied: true,
        authority: "exclusive_mask_pixel_membership",
        competing_mask_count: competitors.length,
        measured_pixel_count: totalOwnedPixelCount,
        priority: samOwnershipPriority(region),
        invariant: "one_visible_pixel_has_one_winning_piece_owner",
      },
    };
  });
}

async function runGroundingDinoDetection(imageUrl, query = DEFAULT_GROUNDING_DINO_QUERY, { timeoutMs = REPLICATE_SAM_TIMEOUT_MS } = {}) {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) {
    console.warn("[GDINO DEBUG] Missing REPLICATE_API_TOKEN: skipping Grounding DINO detection");
    return {
      enabled: false,
      ok: false,
      reason: "missing_REPLICATE_API_TOKEN",
      detections: [],
    };
  }

  const boundedTimeoutMs = Math.max(1500, Math.min(REPLICATE_SAM_TIMEOUT_MS, Number(timeoutMs) || REPLICATE_SAM_TIMEOUT_MS));
  const requestStartedAt = Date.now();
  const deadlineAt = requestStartedAt + boundedTimeoutMs;
  try {
    const groundingDinoVersion = process.env.REPLICATE_GROUNDING_DINO_VERSION || DEFAULT_REPLICATE_GROUNDING_DINO_VERSION;
    const createUrl = "https://api.replicate.com/v1/predictions";
    console.info("[GDINO DEBUG] Starting Grounding DINO detection request", {
      imageUrl,
      query,
      version: groundingDinoVersion,
      createUrl,
    });

    let createResp;
    try {
      createResp = await replicateRequest(createUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          version: groundingDinoVersion,
          input: {
            image: imageUrl,
            query,
          },
        }),
      }, Math.max(1, deadlineAt - Date.now()));
    } catch (error) {
      console.error("[GDINO DEBUG] Grounding DINO create request failed", {
        failure_stage: "create",
        message: error?.message || String(error),
      });
      throw error;
    }

    console.info("[GDINO DEBUG] Grounding DINO create response received", {
      predictionId: createResp?.id || null,
      status: createResp?.status || "unknown",
    });

    const statusUrl = createResp?.urls?.get;
    if (!statusUrl) {
      console.error("[GDINO DEBUG] Grounding DINO create response missing poll URL", {
        predictionId: createResp?.id || null,
      });
      return { enabled: true, ok: false, reason: "missing_poll_url", detections: [] };
    }

    let prediction = createResp;

    while (Date.now() < deadlineAt) {
      if (["succeeded", "failed", "canceled"].includes(prediction?.status)) break;
      await new Promise((resolve) => setTimeout(resolve, REPLICATE_SAM_POLL_MS));
      let retryAttempt = 0;
      let pollError = null;
      while (retryAttempt < REPLICATE_SAM_POLL_RETRY_MAX) {
        try {
          const remainingMs = Math.max(1, deadlineAt - Date.now());
          prediction = await replicateRequest(statusUrl, {
            method: "GET",
            headers: { Authorization: `Bearer ${token}` },
          }, remainingMs);
          pollError = null;
          break;
        } catch (error) {
          pollError = error;
          const transient = isTransientPollingError(error);
          retryAttempt += 1;
          console.warn("[GDINO DEBUG] Grounding DINO poll request retry evaluation", {
            failure_stage: "poll",
            poll_retry_attempt: retryAttempt,
            poll_retry_reason: error?.message || String(error),
            retryable: transient,
            retries_remaining: Math.max(REPLICATE_SAM_POLL_RETRY_MAX - retryAttempt, 0),
          });
          if (!transient || retryAttempt >= REPLICATE_SAM_POLL_RETRY_MAX) break;
          await new Promise((resolve) => setTimeout(resolve, randomPollRetryDelayMs()));
        }
      }
      if (pollError) throw pollError;
      console.info("[GDINO DEBUG] Grounding DINO prediction poll", {
        id: prediction?.id || createResp?.id || null,
        status: prediction?.status || "unknown",
      });
    }

    if (prediction?.status !== "succeeded") {
      console.error("[GDINO DEBUG] Grounding DINO detection did not succeed", {
        predictionId: prediction?.id || createResp?.id || null,
        status: prediction?.status || "unknown",
        error: prediction?.error || null,
        elapsedMs: Date.now() - requestStartedAt,
      });
      return {
        enabled: true,
        ok: false,
        reason: prediction?.error || (prediction?.status === "starting" || prediction?.status === "processing" ? "grounding_dino_timed_out" : prediction?.status) || "unknown_failure",
        detections: [],
      };
    }

    console.info("[GDINO DEBUG] RAW Grounding DINO OUTPUT", {
      outputPreview: JSON.stringify(prediction?.output)?.slice(0, 1000),
    });
    const detections = parseGroundingDinoOutputToDetections(prediction?.output);
    console.info("[GDINO DEBUG] Grounding DINO detection succeeded", {
      detectionCount: detections.length,
      predictionId: prediction?.id || null,
      elapsedMs: Date.now() - requestStartedAt,
    });

    return {
      enabled: true,
      ok: detections.length > 0,
      detections,
    };
  } catch (error) {
    console.error("[GDINO DEBUG] Grounding DINO request error", {
      failure_stage: "outer",
      message: error?.message || String(error),
    });
    return {
      enabled: true,
      ok: false,
      detections: [],
      reason: error?.message || "grounding_dino_request_error",
    };
  }
}

async function runYoloWorldDetection(imageUrl, query = DEFAULT_GROUNDING_DINO_QUERY, { timeoutMs = 12000 } = {}) {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) return { enabled: false, ok: false, reason: "missing_REPLICATE_API_TOKEN", detections: [] };
  const boundedTimeoutMs = Math.max(1500, Math.min(12000, Number(timeoutMs) || 12000));
  const requestStartedAt = Date.now();
  const deadlineAt = requestStartedAt + boundedTimeoutMs;
  try {
    const createResp = await replicateRequest("https://api.replicate.com/v1/predictions", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        version: DEFAULT_REPLICATE_YOLO_WORLD_VERSION,
        input: {
          input_media: imageUrl,
          class_names: yoloClassNamesFromQueryV1(query),
          max_num_boxes: 100,
          score_thr: 0.05,
          nms_thr: 0.5,
          return_json: true,
        },
      }),
    }, Math.max(1, deadlineAt - Date.now()));
    const statusUrl = createResp?.urls?.get;
    if (!statusUrl) return { enabled: true, ok: false, reason: "missing_poll_url", detections: [] };
    let prediction = createResp;
    while (Date.now() < deadlineAt) {
      if (["succeeded", "failed", "canceled"].includes(prediction?.status)) break;
      await new Promise((resolve) => setTimeout(resolve, REPLICATE_SAM_POLL_MS));
      const remainingMs = Math.max(1, deadlineAt - Date.now());
      prediction = await replicateRequest(statusUrl, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      }, remainingMs);
    }
    if (prediction?.status !== "succeeded") {
      return { enabled: true, ok: false, reason: prediction?.error || "yolo_world_timed_out", detections: [] };
    }
    const image = decodeImageRgba(await fetchImageBuffer(imageUrl), imageUrl);
    const detections = parseYoloWorldOutputV1(prediction?.output, {
      imageWidth: image?.width,
      imageHeight: image?.height,
    });
    return {
      enabled: true,
      ok: detections.length > 0,
      reason: detections.length ? null : "no_yolo_world_detections",
      detections,
    };
  } catch (error) {
    return { enabled: true, ok: false, reason: error?.message || "yolo_world_request_error", detections: [] };
  }
}

async function runReplicateSamSegmentation(imageUrl, { timeoutMs = REPLICATE_SAM_TIMEOUT_MS } = {}) {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) {
    console.warn("[SAM DEBUG] Missing REPLICATE_API_TOKEN: skipping SAM segmentation");
    return {
      enabled: false,
      ok: false,
      reason: "missing_REPLICATE_API_TOKEN",
      regions: [],
    };
  }

  const effectiveTimeoutMs = Math.max(
    2500,
    Math.min(REPLICATE_SAM_TIMEOUT_MS, Number(timeoutMs) || REPLICATE_SAM_TIMEOUT_MS)
  );
  const requestStartedAt = Date.now();
  const deadlineAt = requestStartedAt + effectiveTimeoutMs;
  try {
    const samVersion = process.env.REPLICATE_SAM_VERSION || DEFAULT_REPLICATE_SAM_VERSION;
    const createUrl = "https://api.replicate.com/v1/predictions";
    console.info("[SAM DEBUG] Starting SAM segmentation request", {
      imageUrl,
      version: samVersion,
      createUrl,
    });
    let createResp;
    try {
      createResp = await replicateRequest(createUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          version: samVersion,
          input: {
            image: imageUrl,
          },
        }),
      }, Math.max(1, deadlineAt - Date.now()));
    } catch (error) {
      console.error("[SAM DEBUG] SAM create request failed", {
        failure_stage: "create",
        message: error?.message || String(error),
      });
      throw error;
    }
    console.info("[SAM DEBUG] SAM create response received", {
      predictionId: createResp?.id || null,
      status: createResp?.status || "unknown",
    });

    const statusUrl = createResp?.urls?.get;
    if (!statusUrl) {
      console.error("[SAM DEBUG] SAM create response missing poll URL", {
        predictionId: createResp?.id || null,
      });
      return {
        enabled: true,
        ok: false,
        reason: "missing_poll_url",
        regions: [],
      };
    }

    let prediction = createResp;

    while (Date.now() < deadlineAt) {
      if (["succeeded", "failed", "canceled"].includes(prediction?.status)) break;
      await new Promise((resolve) => setTimeout(resolve, REPLICATE_SAM_POLL_MS));
      let retryAttempt = 0;
      let pollError = null;
      while (retryAttempt < REPLICATE_SAM_POLL_RETRY_MAX) {
        try {
          prediction = await replicateRequest(statusUrl, {
            method: "GET",
            headers: { Authorization: `Bearer ${token}` },
          }, Math.max(1, deadlineAt - Date.now()));
          pollError = null;
          break;
        } catch (error) {
          pollError = error;
          const retryReason = error?.message || String(error);
          const transient = isTransientPollingError(error);
          retryAttempt += 1;
          console.warn("[SAM DEBUG] SAM poll request retry evaluation", {
            failure_stage: "poll",
            poll_retry_attempt: retryAttempt,
            poll_retry_reason: retryReason,
            retryable: transient,
            retries_remaining: Math.max(REPLICATE_SAM_POLL_RETRY_MAX - retryAttempt, 0),
          });
          if (!transient || retryAttempt >= REPLICATE_SAM_POLL_RETRY_MAX) break;
          const retryDelayMs = randomPollRetryDelayMs();
          await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
        }
      }
      if (pollError) {
        const exhaustionReason = pollError?.message || String(pollError);
        console.error("[SAM DEBUG] SAM poll retry exhausted", {
          failure_stage: "poll",
          final_retry_exhaustion_reason: exhaustionReason,
          poll_retry_attempts: retryAttempt,
        });
        throw pollError;
      }
      console.info("[SAM DEBUG] SAM prediction poll", {
        id: prediction?.id || createResp?.id || null,
        status: prediction?.status || "unknown",
      });
    }

    if (prediction?.status === "failed" || prediction?.status === "canceled") {
      console.error("[SAM DEBUG] SAM segmentation did not succeed", {
        predictionId: prediction?.id || createResp?.id || null,
        status: prediction?.status || "unknown",
        error: prediction?.error || null,
        elapsedMs: Date.now() - requestStartedAt,
      });
      return {
        enabled: true,
        ok: false,
        reason: prediction?.error || prediction?.status || "unknown_failure",
        regions: [],
      };
    }

    if (prediction?.status !== "succeeded") {
      return {
        enabled: true,
        ok: false,
        reason: "sam_timeout",
        timeout_ms: effectiveTimeoutMs,
        regions: [],
      };
    }

    console.info("[SAM DEBUG] RAW SAM OUTPUT", {
      outputPreview: JSON.stringify(prediction?.output)?.slice(0, 1000),
    });
    const parsedRegions = parseSamOutputToRegions(prediction?.output);
    const enrichedRegions = await enrichSamRegionsWithMaskedColors(imageUrl, parsedRegions);
    console.info("[SAM DEBUG] SAM segmentation succeeded", {
      regionCount: enrichedRegions.length,
      predictionId: prediction?.id || null,
      elapsedMs: Date.now() - requestStartedAt,
    });

    return {
      enabled: true,
      ok: enrichedRegions.length > 0,
      reason: enrichedRegions.length ? null : "malformed_output",
      regions: enrichedRegions,
    };
  } catch (error) {
    console.error("[SAM DEBUG] SAM request error", {
      failure_stage: "outer",
      message: error?.message || String(error),
    });
    return {
      enabled: true,
      ok: false,
      reason: error?.message || "sam_request_error",
      regions: [],
    };
  }
}

async function runReplicateTargetConditionedSamMask(imageUrl, target, { timeoutMs = 16000 } = {}) {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) return { enabled: false, ok: false, reason: "missing_REPLICATE_API_TOKEN", target };
  const effectiveTimeoutMs = Number.isFinite(Number(timeoutMs)) ? Math.max(1, Number(timeoutMs)) : 16000;
  const requestStartedAt = Date.now();
  const deadlineAt = requestStartedAt + effectiveTimeoutMs;
  try {
    let prediction = await replicateRequest("https://api.replicate.com/v1/predictions", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        version: TARGET_CONDITIONED_SAM_VERSION,
        input: {
          image: imageUrl,
          mask_prompt: String(target?.prompt || target?.label || "garment"),
          negative_mask_prompt: "",
          adjustment_factor: -2,
        },
      }),
    }, Math.max(1, deadlineAt - Date.now()));
    const statusUrl = prediction?.urls?.get;
    if (!statusUrl) return { enabled: true, ok: false, reason: "missing_poll_url", target };
    while (Date.now() < deadlineAt && !["succeeded", "failed", "canceled"].includes(prediction?.status)) {
      await new Promise((resolve) => setTimeout(resolve, REPLICATE_SAM_POLL_MS));
      prediction = await replicateRequest(statusUrl, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      }, Math.max(1, deadlineAt - Date.now()));
    }
    if (prediction?.status !== "succeeded") {
      return { enabled: true, ok: false, reason: prediction?.error || prediction?.status || "target_mask_timeout", target };
    }
    const outputs = Array.isArray(prediction?.output) ? prediction.output : [];
    const maskUrl = outputs[2] || null;
    if (!maskUrl) return { enabled: true, ok: false, reason: "target_mask_missing", target };
    return {
      enabled: true,
      ok: true,
      reason: null,
      target,
      region: {
        id: target.id,
        segment_label: target.label,
        label: target.label,
        zone: target.zone,
        confidence: Math.round(Math.max(0.7, Number(target.confidence || 0)) * 100),
        mask_url: maskUrl,
        source_type: "sam_segment",
        target_conditioned_mask_v1: {
          applied: true,
          prompt: target.prompt,
          detector_region_id: target.detector_region_id,
          semantic_instance_key: target.semantic_instance_key,
          layer_role: target.layer_role,
          authority: "spatial_mask_only",
          external_color_authority: false,
        },
      },
      elapsed_ms: Date.now() - requestStartedAt,
    };
  } catch (error) {
    return { enabled: true, ok: false, reason: error?.message || "target_mask_request_error", target };
  }
}

async function runSamSegmentation(imageUrl, { timeoutMs = REPLICATE_SAM_TIMEOUT_MS } = {}) {
  const startedAt = Date.now();
  const deadlineAt = startedAt + Math.max(1000, Number(timeoutMs) || REPLICATE_SAM_TIMEOUT_MS);
  const attempts = [];
  const providers = segmentationProviderOrderV1(process.env);
  if (!providers.length) {
    return { enabled: false, ok: false, reason: "missing_segmentation_provider_credentials", provider: null, regions: [], attempts };
  }

  for (const provider of providers) {
    const remainingMs = Math.max(0, deadlineAt - Date.now());
    if (remainingMs < 1000) break;
    const result = provider === "fal"
      ? await runFalAutoSegmentationV1({ imageUrl, timeoutMs: remainingMs, env: process.env })
      : await runReplicateSamSegmentation(imageUrl, { timeoutMs: remainingMs });
    attempts.push({ provider, ok: !!result?.ok, reason: result?.reason || null, elapsed_ms: result?.elapsed_ms || null });
    if (!result?.ok) continue;

    if (provider === "replicate") return { ...result, provider, attempts };
    const parsedRegions = parseSamOutputToRegions({ individual_masks: result.mask_urls });
    const regions = await enrichSamRegionsWithMaskedColors(imageUrl, parsedRegions.map((region) => ({
      ...region,
      segmentation_provider: "fal",
    })));
    return {
      enabled: true,
      ok: regions.length > 0,
      reason: regions.length ? null : "fal_auto_masks_malformed",
      provider,
      provider_model: segmentationProviderConfigV1(process.env).fal_auto_model,
      request_id: result.request_id || null,
      elapsed_ms: Date.now() - startedAt,
      regions,
      attempts,
    };
  }

  return {
    enabled: true,
    ok: false,
    reason: attempts.map((attempt) => `${attempt.provider}:${attempt.reason || "failed"}`).join("; ") || "segmentation_provider_timeout",
    provider: null,
    regions: [],
    attempts,
  };
}

async function runTargetConditionedSamMask(imageUrl, target, { timeoutMs = 16000, imageDimensions = null } = {}) {
  const startedAt = Date.now();
  const deadlineAt = startedAt + Math.max(1000, Number(timeoutMs) || 16000);
  const attempts = [];
  const providers = segmentationProviderOrderV1(process.env);
  if (!providers.length) {
    return { enabled: false, ok: false, reason: "missing_segmentation_provider_credentials", provider: null, target, attempts };
  }

  for (const provider of providers) {
    const remainingMs = Math.max(0, deadlineAt - Date.now());
    if (remainingMs < 1000) break;
    const result = provider === "fal"
      ? await runFalTargetMaskV1({ imageUrl, target, imageDimensions, timeoutMs: remainingMs, env: process.env })
      : await runReplicateTargetConditionedSamMask(imageUrl, target, { timeoutMs: remainingMs });
    attempts.push({ provider, ok: !!result?.ok, reason: result?.reason || null, elapsed_ms: result?.elapsed_ms || null });
    if (!result?.ok) continue;
    if (provider === "replicate") return { ...result, provider, attempts };

    return {
      enabled: true,
      ok: true,
      reason: null,
      provider,
      target,
      region: {
        id: target.id,
        segment_label: target.label,
        label: target.label,
        zone: target.zone,
        confidence: Math.round(Math.max(Number(result.score || 0), Math.max(0.7, Number(target.confidence || 0))) * 100),
        mask_url: result.mask_url,
        source_type: "sam_segment",
        segmentation_provider: "fal",
        target_conditioned_mask_v1: {
          applied: true,
          prompt: target.prompt,
          detector_region_id: target.detector_region_id,
          semantic_instance_key: target.semantic_instance_key,
          layer_role: target.layer_role,
          authority: "spatial_mask_only",
          external_color_authority: false,
          provider: "fal",
          provider_model: segmentationProviderConfigV1(process.env).fal_target_model,
          request_id: result.request_id || null,
        },
      },
      elapsed_ms: Date.now() - startedAt,
      attempts,
    };
  }

  return {
    enabled: true,
    ok: false,
    reason: attempts.map((attempt) => `${attempt.provider}:${attempt.reason || "failed"}`).join("; ") || "target_mask_provider_timeout",
    provider: null,
    target,
    attempts,
  };
}

async function runTargetConditionedSegmentation(imageUrl, plan, { timeoutMs = 16000 } = {}) {
  const targets = Array.isArray(plan?.targets) ? plan.targets : [];
  if (!targets.length) return { enabled: true, ok: false, reason: "no_segmentation_targets", regions: [], results: [], plan };
  let imageDimensions = null;
  if (segmentationProviderOrderV1(process.env).includes("fal") && targets.some((target) => !!target?.bbox)) {
    try {
      const image = decodeImageRgba(await fetchImageBuffer(imageUrl), imageUrl);
      imageDimensions = { width: image.width, height: image.height };
    } catch {
      imageDimensions = null;
    }
  }
  const results = await Promise.all(targets.map((target) =>
    runTargetConditionedSamMask(imageUrl, target, { timeoutMs, imageDimensions })
  ));
  const rawRegions = results.filter((result) => result?.ok && result?.region).map((result) => result.region);
  const regions = rawRegions.length ? await enrichSamRegionsWithMaskedColors(imageUrl, rawRegions) : [];
  const successfulProviders = [...new Set(results.filter((result) => result?.ok).map((result) => result?.provider).filter(Boolean))];
  return {
    enabled: true,
    ok: regions.length > 0,
    reason: regions.length ? null : results.map((result) => result?.reason).filter(Boolean).join("; ") || "no_target_masks",
    provider: successfulProviders.length === 1 ? successfulProviders[0] : successfulProviders.length ? "mixed" : null,
    providers: successfulProviders,
    regions,
    plan,
    measurement_image_url: imageUrl,
    results: results.map((result) => ({
      ok: !!result?.ok,
      reason: result?.reason || null,
      provider: result?.provider || null,
      attempts: result?.attempts || [],
      target: result?.target || null,
      elapsed_ms: result?.elapsed_ms || null,
    })),
  };
}

/* =========================
   IMAGE OPS
========================= */
async function uploadToCloudinary(file) {
  const dataUri = `data:${file.mimetype};base64,${file.buffer.toString("base64")}`;
  const result = await cloudinary.uploader.upload(dataUri, {
    folder: "cie",
    resource_type: "image",
  });

  if (!result?.secure_url) {
    throw new Error("Cloudinary upload failed (no secure_url)");
  }

  return result.secure_url;
}

async function createAccessoryMicroCropImageUrlV1(imageUrl, crop, targetType = "accessory") {
  try {
    const originalBuffer = await fetchImageBuffer(imageUrl);
    const decodedOriginal = decodeImageRgba(originalBuffer, imageUrl);
    const artifact = cropDecodedImageToPngV1(decodedOriginal, crop);
    if (!artifact?.buffer?.length) {
      return { ok: false, reason: "micro_crop_buffer_unavailable", url: null };
    }
    const dataUri = `data:image/png;base64,${artifact.buffer.toString("base64")}`;
    const uploaded = await cloudinary.uploader.upload(dataUri, {
      folder: "cie/accessory-micro-crops",
      resource_type: "image",
    });
    if (!uploaded?.secure_url) {
      return { ok: false, reason: "micro_crop_upload_missing_url", url: null };
    }
    return {
      ok: true,
      url: uploaded.secure_url,
      crop: artifact.crop,
      pixel_bbox: artifact.pixel_bbox,
      target_type: targetType,
      source: "original_upload_true_crop",
    };
  } catch (error) {
    return {
      ok: false,
      reason: error?.message || "micro_crop_creation_failed",
      url: null,
      target_type: targetType,
      source: "original_upload_true_crop",
    };
  }
}

async function callPixelcutRemoveBg(imageUrl, timeoutMs = PIXELCUT_TIMEOUT_MS) {
  const apiKey = process.env.PIXELCUT_API_KEY;
  const endpoint = process.env.PIXELCUT_ENDPOINT;

  if (!apiKey || !endpoint) {
    throw new Error("Missing Pixelcut env vars (PIXELCUT_API_KEY / PIXELCUT_ENDPOINT)");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(3000, Math.min(PIXELCUT_TIMEOUT_MS, Number(timeoutMs) || PIXELCUT_TIMEOUT_MS)));

  try {
    const resp = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-KEY": apiKey,
        Accept: "application/json",
      },
      body: JSON.stringify({
        image_url: imageUrl,
        format: "png",
      }),
      signal: controller.signal,
    });

    const text = await resp.text();

    if (!resp.ok) {
      throw new Error(`Pixelcut failed: ${resp.status} ${text || "No response body"}`);
    }

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error("Pixelcut returned a non-JSON response");
    }

    if (!data?.result_url) {
      throw new Error("Pixelcut response missing result_url");
    }

    return data.result_url;
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("Pixelcut request timed out");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function analyzeGhostColors(ghostUrl, {
  latencyBudget = null,
  semanticObservationPromise = null,
  targetSegmentationPromise = null,
  targetSegmentationImageUrl = ghostUrl,
} = {}) {
  const res = await cloudinary.uploader.upload(ghostUrl, {
    folder: "cie/ghost",
    resource_type: "image",
    colors: true,
  });

  const colors = Array.isArray(res.colors) ? res.colors : [];
  if (!colors.length) {
    throw new Error("Color analysis failed (no colors returned)");
  }

  const dominantHex = safeHex(String(colors[0][0])) || "#000000";
  const topColors = colors
    .slice(0, 10)
    .map(([hex, pct]) => {
      const safe = safeHex(hex) || "#000000";
      const profile = buildColorProfile(safe, pct);
      const importance = buildVisualImportance(safe, pct);

      return {
        hex: safe,
        name: profile?.name || getColorName(safe),
        pct,
        lab: profile?.lab || getLab(safe),
        perceptual: profile?.perceptual || getPerceptualTraits(safe),
        color_identity: profile?.color_identity || buildColorIdentity({ name: getColorName(safe), hex: safe }),
        importance,
      };
    })
    .filter((x) => !!x.hex);

  const configuredSingleQuery = String(process.env.GROUNDING_DINO_QUERY || "").trim();
  const groundingQueryPlan = buildGroundingDinoQueryPlanV1({
    configuredPrimaryQuery: configuredSingleQuery,
    defaultGarmentQuery: DEFAULT_GROUNDING_DINO_GARMENT_QUERY,
    accessoryQuery: DEFAULT_GROUNDING_DINO_ACCESSORY_QUERY,
  });
  const primaryDinoTimeoutMs = latencyBudget?.providerTimeoutMs
    ? latencyBudget.providerTimeoutMs({ requestedMs: 18000, maximumMs: 18000 })
    : REPLICATE_SAM_TIMEOUT_MS;
  let groundingPasses = await Promise.all(
    groundingQueryPlan.queries.map((query) => runGroundingDinoDetection(ghostUrl, query, { timeoutMs: primaryDinoTimeoutMs }))
  );
  let dinoDetections = groundingPasses.flatMap((pass) => Array.isArray(pass?.detections) ? pass.detections : []);
  let recoveryAttempted = false;
  let fallbackProvider = null;
  let fallbackReason = null;
  if (!dinoDetections.length && latencyBudget?.canRun?.(8000)) {
    recoveryAttempted = true;
    const recoveryTimeoutMs = latencyBudget.providerTimeoutMs({ requestedMs: 12000, maximumMs: 12000 });
    const recoveryPasses = await Promise.all([
      runYoloWorldDetection(ghostUrl, DEFAULT_GROUNDING_DINO_GARMENT_QUERY, { timeoutMs: recoveryTimeoutMs }),
      runYoloWorldDetection(ghostUrl, DEFAULT_GROUNDING_DINO_ACCESSORY_QUERY, { timeoutMs: recoveryTimeoutMs }),
    ]);
    groundingPasses = [...groundingPasses, ...recoveryPasses];
    dinoDetections = recoveryPasses.flatMap((pass) => Array.isArray(pass?.detections) ? pass.detections : []);
    fallbackProvider = "yolo_world_xl";
    fallbackReason = recoveryPasses.every((pass) => !pass?.ok)
      ? recoveryPasses.map((pass) => pass?.reason).filter(Boolean).join("; ") || "all_yolo_world_lanes_failed"
      : null;
  }
  const groundingDino = {
    enabled: groundingPasses.some((pass) => pass?.enabled),
    ok: groundingPasses.some((pass) => pass?.ok),
    reason: groundingPasses.every((pass) => !pass?.ok)
      ? groundingPasses.map((pass) => pass?.reason).filter(Boolean).join("; ") || "all_grounding_dino_passes_failed"
      : null,
    detections: dinoDetections,
    pass_count: groundingPasses.length,
    recovery_attempted: recoveryAttempted,
    fallback_provider: fallbackProvider,
    fallback_reason: fallbackReason,
  };
  let dinoGarmentRegions = buildDinoSegmentedRegions(dinoDetections);
  let decodedImage = null;
  let dinoColorEnrichmentReason = dinoGarmentRegions.length ? "no_bbox_color_enrichment" : "no_dino_garment_regions";
  try {
    if (dinoGarmentRegions.some((region) => !!region?.bbox)) {
      const ghostBuffer = await fetchImageBuffer(ghostUrl);
      decodedImage = decodeImageRgba(ghostBuffer, ghostUrl);
      dinoGarmentRegions = extractColorsFromDinoBboxes(ghostBuffer, dinoGarmentRegions);
      dinoColorEnrichmentReason = "bbox_color_extraction_complete";
    } else if (dinoGarmentRegions.length) {
      dinoColorEnrichmentReason = "no_dino_bboxes";
    }
  } catch (error) {
    dinoColorEnrichmentReason = error?.message || "bbox_color_extraction_failed";
  }
  if (!decodedImage) {
    try {
      decodedImage = decodeImageRgba(await fetchImageBuffer(ghostUrl), ghostUrl);
    } catch (error) {
      console.warn("[PERCEPTION V6] Decoded-image evidence unavailable", { reason: error?.message || "decode_failed" });
    }
  }
  const dinoColorEnrichmentCount = dinoGarmentRegions.filter((region) => safeHex(region?.dominant_hex) && Array.isArray(region?.region_colors) && region.region_colors.length > 0).length;
  const dinoColorEnrichmentOk = dinoColorEnrichmentCount > 0;
  const dinoDebug = {
    enabled: !!groundingDino?.enabled,
    ok: !!groundingDino?.ok,
    reason: groundingDino?.reason || null,
    detection_count: dinoDetections.length,
    pass_count: groundingPasses.length,
    garment_region_count: dinoGarmentRegions.length,
    dino_color_enrichment_count: dinoColorEnrichmentCount,
    dino_color_enrichment_ok: dinoColorEnrichmentOk,
    dino_color_enrichment_reason: dinoColorEnrichmentReason,
    detections: dinoDetections,
    garment_regions: dinoGarmentRegions,
    dino_4_lifecycle_stage: summarizeDinoStageForTrace("debug.dino.garment_regions", dinoGarmentRegions),
  };
  console.info("[GDINO DEBUG] Temporary detection validation", {
    enabled: !!groundingDino?.enabled,
    ok: !!groundingDino?.ok,
    detectionCount: dinoDetections.length,
  });

  // Detector-localized masks do not depend on the semantic observer. Start
  // them immediately so model reasoning and mask generation overlap instead
  // of serially consuming the correction reserve.
  const detectorSegmentationPlan = buildTargetConditionedSegmentationPlanV1({
    dinoRegions: dinoGarmentRegions,
    semanticHandoff: {},
  });
  const detectorTargetTimeoutMs = latencyBudget?.providerTimeoutMs
    ? latencyBudget.providerTimeoutMs({
      requestedMs: Math.min(EARLY_TARGET_SEGMENTATION_BUDGET_MS, 20000),
      maximumMs: 20000,
      minimumMs: 2500,
    })
    : 16000;
  const parallelTargetSegmentationPromise = targetSegmentationPromise || (
    detectorSegmentationPlan.targets.length && (!latencyBudget || latencyBudget.canRun(2500))
      ? runTargetConditionedSegmentation(targetSegmentationImageUrl, detectorSegmentationPlan, { timeoutMs: detectorTargetTimeoutMs })
      : Promise.resolve({
        enabled: true,
        ok: false,
        reason: "transform_latency_budget_exhausted_before_parallel_target_segmentation",
        regions: [],
        results: [],
        plan: detectorSegmentationPlan,
      })
  );
  const externalSemantic = semanticObservationPromise ? await semanticObservationPromise : null;
  const segmentationPlan = buildTargetConditionedSegmentationPlanV1({
    dinoRegions: dinoGarmentRegions,
    semanticHandoff: externalSemantic?.handoff || {},
  });
  const earlyTargetSegmentation = await parallelTargetSegmentationPromise;
  const targetSamTimeoutMs = latencyBudget?.providerTimeoutMs
    ? latencyBudget.providerTimeoutMs({ requestedMs: 16000, maximumMs: 16000 })
    : 16000;
  const planBindingEnabled = segmentationPlanBindingEnabledV1(process.env);
  const preparedEarlySegmentation = earlyTargetSegmentation?.ok && planBindingEnabled
    ? bindEarlySegmentationToFinalPlanV1({
        earlySegmentation: earlyTargetSegmentation,
        finalPlan: segmentationPlan,
      })
    : null;
  let sam = earlyTargetSegmentation?.ok
    ? (preparedEarlySegmentation?.segmentation || earlyTargetSegmentation)
    : latencyBudget && !latencyBudget.canRun(2500)
      ? earlyTargetSegmentation || { enabled: true, ok: false, reason: "transform_latency_budget_exhausted_before_target_segmentation", regions: [], results: [] }
      : await runTargetConditionedSegmentation(ghostUrl, segmentationPlan, { timeoutMs: targetSamTimeoutMs });
  if (preparedEarlySegmentation?.missing_plan?.targets?.length && (!latencyBudget || latencyBudget.canRun(2500))) {
    const supplementalTimeoutMs = latencyBudget?.providerTimeoutMs
      ? latencyBudget.providerTimeoutMs({ requestedMs: 12000, maximumMs: 12000, minimumMs: 2500 })
      : 12000;
    const supplementalSegmentation = await runTargetConditionedSegmentation(
      ghostUrl,
      preparedEarlySegmentation.missing_plan,
      { timeoutMs: supplementalTimeoutMs }
    );
    sam = mergeTargetConditionedSegmentationsV1({
      base: sam,
      supplement: supplementalSegmentation,
      validationPlan: preparedEarlySegmentation.validation_plan,
    });
  }
  if (!sam?.ok && latencyBudget?.canRun?.(5000)) {
    const fallbackTimeoutMs = latencyBudget.providerTimeoutMs({ requestedMs: 10000, maximumMs: 10000 });
    sam = await runSamSegmentation(ghostUrl, { timeoutMs: fallbackTimeoutMs });
  }
  if (sam?.results) {
    const spatialValidation = validateTargetConditionedMaskRegionsV1({
      regions: sam?.regions || [],
      plan: planBindingEnabled ? (sam?.plan || segmentationPlan) : segmentationPlan,
    });
    const remeasuredRegions = spatialValidation.validated_count
      ? await enrichSamRegionsWithMaskedColors(sam?.measurement_image_url || ghostUrl, spatialValidation.regions)
      : [];
    const validation = validateTargetConditionedMaskMeasurementsV1({
      validation: spatialValidation,
      regions: remeasuredRegions,
    });
    sam = {
      ...sam,
      ok: validation.validated_count > 0,
      reason: validation.validated_count ? null : "no_spatially_validated_target_masks",
      regions: validation.regions,
      target_conditioned_validation_v1: validation,
    };
  }
  const samRegions = Array.isArray(sam?.regions) ? sam.regions : [];
  const samOk = !!sam?.ok && samRegions.length > 0;
  const dinoOk = !!groundingDino?.ok && dinoDetections.length > 0;
  const dinoGarmentOk = dinoGarmentRegions.length > 0;
  const detectionSegmentationOk = samOk || dinoGarmentOk;
  const garmentZoneSource = getGarmentZoneSource(samOk ? samRegions : [], dinoGarmentRegions);
  const segmentationProvider = samOk ? (sam?.provider || samRegions[0]?.segmentation_provider || "replicate") : null;
  const detectionProvider = dinoOk ? (fallbackProvider || "grounding_dino") : null;

  return {
    dominantHex,
    dominantName: getColorName(dominantHex),
    topColors,
    decodedImage,
    segmentedRegions: samOk ? samRegions : dinoGarmentRegions,
    dinoGarmentRegions,
    dino_debug: dinoDebug,
    externalSemantic,
    semantic_scene_graph_v1: segmentationPlan.scene_graph,
    target_conditioned_segmentation_plan_v1: segmentationPlan,
    pipeline: {
      sam_enabled: !!sam?.enabled,
      sam_ok: samOk,
      sam_reason: sam?.reason || null,
      sam_version: sam?.provider_model || (sam?.results && segmentationProvider === "replicate"
        ? `target_conditioned:${TARGET_CONDITIONED_SAM_VERSION}`
        : (process.env.REPLICATE_SAM_MODEL || DEFAULT_REPLICATE_SAM_MODEL)),
      segmentation_provider_config_v1: segmentationProviderConfigV1(process.env),
      segmentation_provider_attempts: sam?.attempts || [],
      target_conditioned_segmentation: !!sam?.results,
      early_target_conditioned_segmentation: !!earlyTargetSegmentation?.ok,
      target_conditioned_results: sam?.results || [],
      target_conditioned_validation_v1: sam?.target_conditioned_validation_v1 || null,
      target_conditioned_plan_binding_v1: {
        enabled: planBindingEnabled,
        rebound_count: preparedEarlySegmentation?.rebound_count || 0,
        unmatched_early_target_count: preparedEarlySegmentation?.unmatched_early_target_count || 0,
        supplemental_target_count: preparedEarlySegmentation?.missing_plan?.targets?.length || 0,
      },
      sam_throttled: isReplicateThrottleError(sam?.reason),
      dino_enabled: !!groundingDino?.enabled,
      dino_ok: dinoOk,
      dino_reason: groundingDino?.reason || null,
      dino_detection_count: dinoDetections.length,
      dino_recovery_attempted: recoveryAttempted,
      detector_fallback_provider: fallbackProvider,
      detector_fallback_reason: fallbackReason,
      dino_garment_region_count: dinoGarmentRegions.length,
      dino_region_count: dinoGarmentRegions.length,
      dino_color_enrichment_count: dinoColorEnrichmentCount,
      dino_color_enrichment_ok: dinoColorEnrichmentOk,
      dino_color_enrichment_reason: dinoColorEnrichmentReason,
      dino_query: DEFAULT_GROUNDING_DINO_QUERY,
      detection_segmentation_ok: detectionSegmentationOk,
      detection_provider: detectionProvider,
      segmentation_provider: segmentationProvider,
      mask_provider: segmentationProvider,
      fallback_mode: !samOk,
      garment_zone_source: garmentZoneSource,
    },
  };
}

/* =========================
   ROUTES
========================= */
app.post("/api/images/transform", upload.any(), async (req, res) => {
  try {
    const files = Array.isArray(req.files) ? req.files : [];
    const file = files[0];

    if (!file) {
      return res.status(400).json({
        success: false,
        step: "multer_parse",
        error: "No image uploaded (missing multipart file).",
      });
    }

    let publicUrl;
    try {
      publicUrl = await uploadToCloudinary(file);
    } catch (error) {
      return sendStepError(res, 500, "upload_cloudinary", error);
    }

    // The inference budget begins after durable upload. Network time spent
    // receiving/storing the user's file must not consume the correction lane.
    const transformLatencyBudget = createTransformLatencyBudgetV1({
      totalMs: Number(process.env.VISIONCORE_TRANSFORM_BUDGET_MS) || 70000,
      reserveMs: Number(process.env.VISIONCORE_TRANSFORM_RESPONSE_RESERVE_MS) || 5000,
      correctionReserveMs: Number(process.env.VISIONCORE_CORRECTION_RESERVE_MS) || 30000,
    });

    // Semantic understanding starts before background removal and detector work.
    // It may name unfamiliar pieces, layers, and tiny details, but remains unable
    // to provide numeric color or publication authority.
    const earlyExternalSemanticPromise = runOpenAISemanticObserverV1({
      mode: EXTERNAL_INTELLIGENCE_MODE,
      imageUrl: publicUrl,
      visionCoreEvidence: {
        pipeline_version: "visioncore_semantic_mask_orchestration_v1",
        phase: "pre_measurement_scene_understanding",
      },
      visionCoreDecision: {},
      model: OPENAI_SEMANTIC_MODEL,
      profile: "segmentation_scene",
      timeoutMs: transformLatencyBudget.providerTimeoutMs({
        requestedMs: EARLY_SEMANTIC_OBSERVER_BUDGET_MS,
        maximumMs: EARLY_SEMANTIC_OBSERVER_BUDGET_MS,
      }),
      cache: externalSemanticCache,
      cacheKey: `${publicUrl}:visioncore_semantic_mask_orchestration_v2:${OPENAI_SEMANTIC_MODEL}`,
    });
    const earlyColorLightingPromise = runOpenAISemanticObserverV1({
      mode: EXTERNAL_INTELLIGENCE_MODE,
      imageUrl: publicUrl,
      visionCoreEvidence: {
        pipeline_version: "visioncore_color_lighting_observer_v1",
        phase: "parallel_intrinsic_color_and_lighting_observation",
      },
      visionCoreDecision: {},
      model: OPENAI_SEMANTIC_MODEL,
      profile: "color_lighting",
      timeoutMs: transformLatencyBudget.providerTimeoutMs({
        requestedMs: EARLY_SEMANTIC_OBSERVER_BUDGET_MS,
        maximumMs: EARLY_SEMANTIC_OBSERVER_BUDGET_MS,
      }),
      cache: externalSemanticCache,
      cacheKey: `${publicUrl}:visioncore_color_lighting_observer_v1:${OPENAI_SEMANTIC_MODEL}`,
    });
    let ghostUrl;
    try {
      ghostUrl = await callPixelcutRemoveBg(
        publicUrl,
        transformLatencyBudget.providerTimeoutMs({ requestedMs: PIXELCUT_TIMEOUT_MS, maximumMs: 18000 })
      );
    } catch (error) {
      return sendStepError(res, 502, "pixelcut_remove_bg", error);
    }

    let analysis;
    try {
      analysis = await analyzeGhostColors(ghostUrl, {
        latencyBudget: transformLatencyBudget,
        semanticObservationPromise: earlyExternalSemanticPromise,
        targetSegmentationImageUrl: publicUrl,
      });
    } catch (error) {
      return sendStepError(res, 500, "analyze_cloudinary_colors", error);
    }
    let segmentedRegions = Array.isArray(analysis?.segmentedRegions) ? analysis.segmentedRegions : [];
    if (!analysis?.pipeline?.detection_segmentation_ok || !segmentedRegions.length) {
      const samReason = analysis?.pipeline?.sam_reason || "sam_failed";
      console.warn("[SAM DEBUG] Continuing /api/images/transform without SAM segmented regions", {
        reason: samReason,
        sam_enabled: !!analysis?.pipeline?.sam_enabled,
        sam_ok: !!analysis?.pipeline?.sam_ok,
        sam_throttled: !!analysis?.pipeline?.sam_throttled,
        dino_ok: !!analysis?.pipeline?.dino_ok,
        dino_detection_count: Number(analysis?.pipeline?.dino_detection_count || 0),
        regionCount: segmentedRegions.length,
      });
    }

    let v2;
    let outfitAnalysis;
    let captureQuality;
    try {
      v2 = generatePalettesV2(analysis.dominantHex);
      captureQuality = evaluateCaptureQualityV1({
        decodedImage: analysis.decodedImage,
        regions: segmentedRegions,
      });
      outfitAnalysis = buildOutfitAnalysis({
        dominantHex: analysis.dominantHex,
        topColors: analysis.topColors,
        segmentedRegions,
        decodedImage: analysis.decodedImage,
        perception_v6_mode: MARKET_PERCEPTION_V6_MODE,
        dinoGarmentRegions: analysis.dinoGarmentRegions,
        pipeline: analysis.pipeline,
      });
      outfitAnalysis = {
        ...outfitAnalysis,
        capture_quality_v1: captureQuality,
      };
      outfitAnalysis.consumer_evidence_v1 = buildConsumerEvidenceV1({
        outfitAnalysis,
        captureQuality,
      });
    } catch (error) {
      return sendStepError(res, 500, "palette_engine", error);
    }

    // A validated local accessory identity with rejected color is a stronger
    // reason to spend the remaining latency budget than optional semantic
    // corroboration. Detect that condition before the observer runs so the
    // observer cannot consume the only window in which object-local color can
    // still be recovered.
    const preExternalAccessoryIntelligenceLane = buildAccessoryIntelligenceLaneV1({
      outfitAnalysis,
      reconciliation: { candidates: [] },
    });
    const preExternalForcedAccessoryTargets = (
      preExternalAccessoryIntelligenceLane?.forced_micro_crop_targets || []
    ).filter((type) => ["watch", "earrings"].includes(type));
    // remainingMs() already excludes the response reserve. Count that reserve
    // toward the full recovery window instead of requiring 10s plus the 5s
    // reserve (15s total) before a bounded 10s recovery may start.
    const accessoryReanalysisMinimumRemainingMs = Math.max(
      1000,
      ACCESSORY_REANALYSIS_BUDGET_MS - transformLatencyBudget.reserve_ms
    );
    const localAccessoryRecoveryRequired = Boolean(
      captureQuality?.disposition !== "retake" &&
      EXTERNAL_INTELLIGENCE_MODE === "assist" &&
      TARGETED_ACCESSORY_REANALYSIS_MODE === "assist" &&
      preExternalForcedAccessoryTargets.length
    );
    const externalObserverMinimumRemainingMs = localAccessoryRecoveryRequired
      ? EXTERNAL_SEMANTIC_OBSERVER_BUDGET_MS + accessoryReanalysisMinimumRemainingMs
      : EXTERNAL_SEMANTIC_OBSERVER_BUDGET_MS;
    const earlySemanticAvailable = Boolean(analysis?.externalSemantic);
    const effectiveExternalIntelligenceMode = earlySemanticAvailable
      ? EXTERNAL_INTELLIGENCE_MODE
      : captureQuality?.disposition === "retake" || !transformLatencyBudget.canRun(externalObserverMinimumRemainingMs)
        ? "off"
        : EXTERNAL_INTELLIGENCE_MODE;
    const accessoryRecoveryPrioritizedOverExternalObserver = Boolean(
      localAccessoryRecoveryRequired && effectiveExternalIntelligenceMode === "off"
    );
    const earlyColorSemantic = await earlyColorLightingPromise;
    const rawExternalSemantic = earlyColorSemantic?.ok ? earlyColorSemantic : analysis?.externalSemantic || await runOpenAISemanticObserverV1({
      mode: effectiveExternalIntelligenceMode,
      imageUrl: publicUrl,
      visionCoreEvidence: buildExternalSemanticEvidence(outfitAnalysis),
      visionCoreDecision: buildExternalCompositeDecision(outfitAnalysis),
      model: OPENAI_SEMANTIC_MODEL,
      timeoutMs: transformLatencyBudget.providerTimeoutMs({
        requestedMs: EXTERNAL_SEMANTIC_OBSERVER_BUDGET_MS,
        maximumMs: EXTERNAL_SEMANTIC_OBSERVER_BUDGET_MS,
      }),
      cache: externalSemanticCache,
      cacheKey: `${publicUrl}:visioncore_external_handoff_v1:${OPENAI_SEMANTIC_MODEL}`,
    });
    const externalSemantic = {
      ...rawExternalSemantic,
      handoff: mergeExternalSemanticHandoffsV1({
        sceneHandoff: analysis?.externalSemantic?.handoff || {},
        colorHandoff: rawExternalSemantic?.handoff || {},
      }),
    };
    let semanticReconciliation = reconcileExternalSemanticsV1({
      handoff: externalSemantic?.handoff,
      outfitAnalysis,
    });
    const secondPassSyntheses = mergeCorrectionSynthesesV1(
      buildLocalMeasurementIntegritySynthesesV1(outfitAnalysis),
      buildAppearanceMeasurementSynthesesV1(semanticReconciliation),
    );
    const secondPassBudgetMs = Math.min(
      RUNTIME_SECOND_PASS_BUDGET_MS,
      transformLatencyBudget.correctionRemainingMs()
    );
    let secondPassRemeasurementPromise = null;
    let secondPassFreshSegmentationPromise = null;
    const correctionZones = new Set(secondPassSyntheses
      .map((synthesis) => segmentationZoneForPieceV1(synthesis?.piece, synthesis?.piece))
      .filter(Boolean));
    const primaryCorrectionZones = new Set(["outerwear", "upper_garment", "lower_garment", "footwear"]
      .filter((zone) => correctionZones.has(zone)));
    const runtimeSecondPass = await executeRuntimeSecondPassV1({
      syntheses: secondPassSyntheses,
      imageUrl: publicUrl,
      totalBudgetMs: secondPassBudgetMs,
      remeasureVisionCore: async ({ piece, instance_key: instanceKey, force_fresh_segmentation: forceFreshSegmentation }) => {
        const zone = segmentationZoneForPieceV1(piece, piece);
        secondPassRemeasurementPromise ||= enrichSamRegionsWithMaskedColors(publicUrl, segmentedRegions);
        const remeasuredRegions = await secondPassRemeasurementPromise;
        let candidates = remeasuredRegions.filter((region) => {
          if (region?.zone !== zone) return false;
          const regionInstanceKey = region?.target_conditioned_mask_v1?.semantic_instance_key || null;
          return !instanceKey || !regionInstanceKey || regionInstanceKey === instanceKey;
        });
        const hasCurrentValidatedMask = candidates.some((region) =>
          isValidatedFreshTargetMaskRegionV1(region, { zone, instanceKey })
        );
        // A second pass must be able to recover a target rejected or missed in
        // the first pass. Re-coloring only surviving regions cannot correct a
        // missing jacket, shirt, or small accessory. A target-conditioned mask
        // acquired and validated during this same request is already fresh;
        // do not buy and wait for the identical provider mask a second time.
        if (!candidates.length || (forceFreshSegmentation && !hasCurrentValidatedMask)) {
          if (forceFreshSegmentation && !hasCurrentValidatedMask) candidates = [];
          const originalTargets = analysis?.target_conditioned_segmentation_plan_v1?.targets || [];
          const recoveryZoneSet = primaryCorrectionZones.size ? primaryCorrectionZones : correctionZones;
          const seenRecoveryTargets = new Set();
          const recoveryTargets = originalTargets.filter((target) => {
            if (!recoveryZoneSet.has(target?.zone)) return false;
            const key = `${target?.zone || "unknown"}:${target?.semantic_instance_key || target?.id || target?.label || "default"}`;
            if (seenRecoveryTargets.has(key)) return false;
            seenRecoveryTargets.add(key);
            return true;
          }).slice(0, 6);
          if (recoveryTargets.length) {
            const recoveryPlan = {
              ...(analysis?.target_conditioned_segmentation_plan_v1 || {}),
              targets: recoveryTargets,
              candidate_target_count: recoveryTargets.length,
              target_limit: recoveryTargets.length,
              omitted_target_count: 0,
              recovery_pass: true,
            };
            secondPassFreshSegmentationPromise ||= (async () => {
              const recovered = await runTargetConditionedSegmentation(publicUrl, recoveryPlan, {
                timeoutMs: transformLatencyBudget.correctionProviderTimeoutMs({
                  requestedMs: Math.max(1000, Math.min(20000, secondPassBudgetMs)),
                  maximumMs: 20000,
                  minimumMs: 1000,
                }),
              });
              if (!recovered?.results) return [];
              const spatial = validateTargetConditionedMaskRegionsV1({
                regions: recovered?.regions || [],
                plan: recoveryPlan,
              });
              const measured = validateTargetConditionedMaskMeasurementsV1({
                validation: spatial,
                regions: spatial.regions,
              });
              return measured.regions.map((region) => ({
                ...region,
                semantic_recovery_pass_v1: true,
              }));
            })();
            const freshCandidates = (await secondPassFreshSegmentationPromise).filter((region) => {
              if (region?.zone !== zone) return false;
              const regionInstanceKey = region?.target_conditioned_mask_v1?.semantic_instance_key || null;
              return !instanceKey || !regionInstanceKey || regionInstanceKey === instanceKey;
            });
            if (freshCandidates.length) candidates = freshCandidates;
          }
        }
        if (!candidates.length) return { available: false, piece, instance_key: instanceKey, regions: [] };
        return { available: candidates.length > 0, piece, instance_key: instanceKey, regions: candidates };
      },
    });
    const secondPassRegions = runtimeSecondPass.results
      .flatMap((entry) => entry?.visioncore_remeasurement?.result?.regions || []);
    if (secondPassRegions.length) {
      const replacementById = new Map(secondPassRegions
        .filter((region) => region?.id)
        .map((region) => [region.id, region]));
      segmentedRegions = segmentedRegions.map((region) => replacementById.get(region?.id) || region);
      analysis.segmentedRegions = segmentedRegions;
      outfitAnalysis = buildOutfitAnalysis({
        dominantHex: analysis.dominantHex,
        topColors: analysis.topColors,
        segmentedRegions,
        decodedImage: analysis.decodedImage,
        perception_v6_mode: MARKET_PERCEPTION_V6_MODE,
        dinoGarmentRegions: analysis.dinoGarmentRegions,
        pipeline: analysis.pipeline,
      });
      outfitAnalysis = { ...outfitAnalysis, capture_quality_v1: captureQuality };
      semanticReconciliation = reconcileExternalSemanticsV1({
        handoff: externalSemantic?.handoff,
        outfitAnalysis,
      });
    }
    const semanticIntrinsicRemeasurement = applySemanticIntrinsicRemeasurementV1({
      regions: segmentedRegions,
      semanticHandoff: externalSemantic?.handoff,
    });
    if (semanticIntrinsicRemeasurement.summary.applied) {
      segmentedRegions = semanticIntrinsicRemeasurement.regions;
      analysis.segmentedRegions = segmentedRegions;
      outfitAnalysis = buildOutfitAnalysis({
        dominantHex: analysis.dominantHex,
        topColors: analysis.topColors,
        segmentedRegions,
        decodedImage: analysis.decodedImage,
        perception_v6_mode: MARKET_PERCEPTION_V6_MODE,
        dinoGarmentRegions: analysis.dinoGarmentRegions,
        pipeline: analysis.pipeline,
      });
      outfitAnalysis = {
        ...outfitAnalysis,
        capture_quality_v1: captureQuality,
      };
      semanticReconciliation = reconcileExternalSemanticsV1({
        handoff: externalSemantic?.handoff,
        outfitAnalysis,
      });
    }
    let accessoryIntelligenceLane = buildAccessoryIntelligenceLaneV1({
      outfitAnalysis,
      reconciliation: semanticReconciliation,
    });
    let targetedAccessoryReanalysis = buildTargetedAccessoryReanalysisPlanV1({
      mode: resolveTargetedAccessoryReanalysisModeV1({
        externalMode: accessoryRecoveryPrioritizedOverExternalObserver
          ? EXTERNAL_INTELLIGENCE_MODE
          : effectiveExternalIntelligenceMode,
        configuredMode: TARGETED_ACCESSORY_REANALYSIS_MODE,
      }),
      reconciliation: semanticReconciliation,
      outfitAnalysis,
    });
    const forcedAccessoryTargets = (accessoryIntelligenceLane?.forced_micro_crop_targets || [])
      .filter((type) => ["watch", "earrings", "ring", "bracelet", "necklace", "chain", "pendant"].includes(type));
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
      const forcedQueries = forcedAccessoryTargets.flatMap((type) => ({
        watch: ["watch"], earrings: ["earring", "stud earring", "earrings"],
        ring: ["finger ring", "rings"], bracelet: ["bracelet", "wrist jewelry"],
        necklace: ["necklace"], chain: ["chain necklace"], pendant: ["pendant necklace"],
      }[type] || [type]));
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
    if (
      targetedAccessoryReanalysis.execution_allowed &&
      targetedAccessoryReanalysis.query &&
      (
        !(localAccessoryRecoveryRequired
          ? transformLatencyBudget.canRunCorrection(1500)
          : transformLatencyBudget.canRun(1500)) ||
        (
          !localAccessoryRecoveryRequired &&
          !shouldRunAccessoryEscalationV1(transformLatencyBudget, accessoryReanalysisMinimumRemainingMs)
        )
      )
    ) {
      targetedAccessoryReanalysis = {
        ...targetedAccessoryReanalysis,
        execution_allowed: false,
        latency_budget_skipped: true,
        identity_fallback_preserved: true,
        reason: (localAccessoryRecoveryRequired
          ? transformLatencyBudget.canRunCorrection(1500)
          : transformLatencyBudget.canRun(1500))
          ? "transform_latency_budget_insufficient_for_optional_accessory_reanalysis"
          : "transform_latency_budget_exhausted_before_accessory_reanalysis",
      };
    }
    if (targetedAccessoryReanalysis.execution_allowed && targetedAccessoryReanalysis.query) {
      const accessoryBudgetCanRun = (minimumMs) => localAccessoryRecoveryRequired
        ? transformLatencyBudget.canRunCorrection(minimumMs)
        : transformLatencyBudget.canRun(minimumMs);
      const accessoryProviderTimeoutMs = (options) => localAccessoryRecoveryRequired
        ? transformLatencyBudget.correctionProviderTimeoutMs(options)
        : transformLatencyBudget.providerTimeoutMs(options);
      const targetedDetectorTimeoutMs = accessoryProviderTimeoutMs({
        requestedMs: ACCESSORY_REANALYSIS_BUDGET_MS,
        maximumMs: ACCESSORY_REANALYSIS_BUDGET_MS,
      });
      const targetedDetector = await runGroundingDinoDetection(
        ghostUrl,
        targetedAccessoryReanalysis.query,
        { timeoutMs: targetedDetectorTimeoutMs }
      );
      const targetedFilter = filterTargetedAccessoryDetectionsV1({
        plan: targetedAccessoryReanalysis,
        detections: targetedDetector?.detections || [],
        imageDimensions: analysis.decodedImage,
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
        let trueMicroCropArtifact = null;
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
          detectorValidated: Boolean(detectorCandidate),
          detectorConfidence: Number(detectorCandidate?.confidence || 0),
          runDetector: async ({ imageUrl: sourceImageUrl, crop }) => {
            const cropArtifact = await createAccessoryMicroCropImageUrlV1(
              sourceImageUrl,
              crop,
              accessoryMicroCropTarget
            );
            trueMicroCropArtifact = cropArtifact;
            if (!cropArtifact?.ok || !cropArtifact?.url) {
              return {
                enabled: true,
                ok: false,
                reason: cropArtifact?.reason || "true_micro_crop_creation_failed",
                detections: [],
                true_micro_crop_v1: cropArtifact,
              };
            }
            if (!accessoryBudgetCanRun(1500)) {
              return {
                enabled: true,
                ok: false,
                reason: "transform_latency_budget_exhausted_before_micro_crop_detection",
                detections: [],
                true_micro_crop_v1: cropArtifact,
              };
            }
            const detected = await runGroundingDinoDetection(cropArtifact.url, microQuery, {
              timeoutMs: accessoryProviderTimeoutMs({
                requestedMs: ACCESSORY_REANALYSIS_BUDGET_MS,
                maximumMs: ACCESSORY_REANALYSIS_BUDGET_MS,
              }),
            });
            const remappedDetections = (detected?.detections || [])
              .map((detection) => remapCropDetectionToFullImageV1(
                detection,
                cropArtifact.crop,
                cropArtifact.pixel_bbox
              ))
              .filter(Boolean);
            return {
              ...detected,
              ok: remappedDetections.length > 0,
              detections: remappedDetections,
              true_micro_crop_v1: {
                ok: true,
                source: cropArtifact.source,
                target_type: cropArtifact.target_type,
                crop: cropArtifact.crop,
                pixel_bbox: cropArtifact.pixel_bbox,
                detector_input: "physical_original_image_crop",
                remapped_detection_count: remappedDetections.length,
              },
            };
          },
          runSegmenter: async ({ crop }) => {
            if (!trueMicroCropArtifact?.ok || !trueMicroCropArtifact?.url) {
              trueMicroCropArtifact = await createAccessoryMicroCropImageUrlV1(
                publicUrl,
                crop,
                accessoryMicroCropTarget
              );
            }
            if (!trueMicroCropArtifact?.ok || !trueMicroCropArtifact?.url) {
              return {
                enabled: true,
                ok: false,
                reason: trueMicroCropArtifact?.reason || "true_micro_crop_unavailable_for_segmentation",
                regions: [],
              };
            }
            if (!accessoryBudgetCanRun(1500)) {
              return {
                enabled: true,
                ok: false,
                reason: "transform_latency_budget_exhausted_before_micro_crop_segmentation",
                regions: [],
              };
            }
            const segmented = await runSamSegmentation(trueMicroCropArtifact.url, {
              timeoutMs: accessoryProviderTimeoutMs({
                requestedMs: ACCESSORY_MICRO_CROP_SAM_TIMEOUT_MS,
                maximumMs: ACCESSORY_MICRO_CROP_SAM_TIMEOUT_MS,
              }),
            });
            const remappedRegions = (Array.isArray(segmented?.regions) ? segmented.regions : [])
              .map((region) => remapCropMaskRegionToFullImageV1(region, trueMicroCropArtifact.crop || crop))
              .filter(Boolean);
            return {
              ...segmented,
              ok: remappedRegions.length > 0,
              regions: remappedRegions,
              true_micro_crop_v1: {
                ok: true,
                source: trueMicroCropArtifact.source,
                target_type: trueMicroCropArtifact.target_type,
                crop: trueMicroCropArtifact.crop,
                pixel_bbox: trueMicroCropArtifact.pixel_bbox,
                segmentation_input: "physical_original_image_crop",
                remapped_mask_count: remappedRegions.length,
              },
            };
          },
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
          // Identity-first doctrine: a failed refinement pass cannot erase an
          // already accepted full-image VisionCore spatial detection. Keep the
          // detection for identity publication; downstream mask/color gates
          // still decide whether any color authority can be published.
          accessoryMicroCropRuntime = {
            ...accessoryMicroCropRuntime,
            identity_fallback_preserved: targetedAcceptedDetections.some((detection) =>
              microCropLabelMatches(detection, accessoryMicroCropTarget)
            ),
          };
        }
      }

      let targetedRegions = buildDinoSegmentedRegions(targetedAcceptedDetections)
        .map((region, index) => ({
          ...region,
          id: `targeted_dino_${index + 1}`,
          targeted_reanalysis_v1: true,
        }));
      const microCropSamRegions = Array.isArray(accessoryMicroCropRuntime?.segmentation?.regions)
        ? accessoryMicroCropRuntime.segmentation.regions
        : [];
      if (targetedRegions.length && microCropSamRegions.length) {
        const strictPositiveMaskRegions = attachAccessoryPositiveMaskOwnershipV1(
          targetedRegions,
          microCropSamRegions
        );
        const boundedRecovery = applyAccessoryMaskRecoveryV1(
          strictPositiveMaskRegions,
          microCropSamRegions
        );
        targetedRegions = boundedRecovery.regions;
        accessoryMicroCropRuntime = {
          ...accessoryMicroCropRuntime,
          mask_recovery_v1: boundedRecovery.summary,
          color_ownership_candidate_count: targetedRegions.filter((region) =>
            region?.positive_accessory_mask_v1?.validated === true
          ).length,
        };
      }
      if (targetedRegions.length) {
        try {
          const ghostBuffer = await fetchImageBuffer(ghostUrl);
          targetedRegions = extractColorsFromDinoBboxes(ghostBuffer, targetedRegions);
        } catch (error) {
          console.warn("[TARGETED REANALYSIS] Object-local color extraction unavailable", {
            message: error?.message || String(error),
          });
        }
      }
      targetedAccessoryReanalysis = {
        ...targetedAccessoryReanalysis,
        executed_detector_passes: 1,
        detector_ok: Boolean(targetedDetector?.ok),
        detector_reason: targetedDetector?.reason || null,
        accepted_detection_count: targetedAcceptedDetections.length,
        rejected_detection_count: targetedFilter.rejected.length,
        accepted_detections: targetedAcceptedDetections,
        rejected_detections: targetedFilter.rejected,
        accessory_micro_crop_runtime_v1: accessoryMicroCropRuntime,
        accessory_micro_crop_target: accessoryMicroCropTarget,
        accessory_micro_crop_applied: Boolean(
          accessoryMicroCropRuntime?.ok &&
          !accessoryMicroCropRuntime?.skipped &&
          accessoryMicroCropRuntime?.clipped_detections?.length
        ),
        measured_regions: targetedRegions,
        publication_changed: false,
        color_changed: false,
      };

      if (targetedAccessoryReanalysis.publication_allowed && targetedRegions.length) {
        const previousAccessoryInstances = outfitAnalysis?.accessory_instances_v1?.instances || [];
        const previousPublishedColorCount = previousAccessoryInstances.filter((instance) =>
          instance?.color_publication_decision === "publish_object_local_color"
        ).length;
        analysis.dinoGarmentRegions = [
          ...(Array.isArray(analysis?.dinoGarmentRegions) ? analysis.dinoGarmentRegions : []),
          ...targetedRegions,
        ];
        outfitAnalysis = buildOutfitAnalysis({
          dominantHex: analysis.dominantHex,
          topColors: analysis.topColors,
          segmentedRegions,
          decodedImage: analysis.decodedImage,
          perception_v6_mode: MARKET_PERCEPTION_V6_MODE,
          dinoGarmentRegions: analysis.dinoGarmentRegions,
          pipeline: analysis.pipeline,
        });
        outfitAnalysis = {
          ...outfitAnalysis,
          capture_quality_v1: captureQuality,
        };
        outfitAnalysis.consumer_evidence_v1 = buildConsumerEvidenceV1({
          outfitAnalysis,
          captureQuality,
        });
        semanticReconciliation = reconcileExternalSemanticsV1({
          handoff: externalSemantic?.handoff,
          outfitAnalysis,
        });
        accessoryIntelligenceLane = buildAccessoryIntelligenceLaneV1({
          outfitAnalysis,
          reconciliation: semanticReconciliation,
        });
        const nextAccessoryInstances = outfitAnalysis?.accessory_instances_v1?.instances || [];
        const nextPublishedColorCount = nextAccessoryInstances.filter((instance) =>
          instance?.color_publication_decision === "publish_object_local_color"
        ).length;
        targetedAccessoryReanalysis.measurement_augmented = true;
        targetedAccessoryReanalysis.publication_changed = nextAccessoryInstances.length > previousAccessoryInstances.length;
        targetedAccessoryReanalysis.color_changed = nextPublishedColorCount > previousPublishedColorCount;
      }
    } else {
      targetedAccessoryReanalysis = {
        ...targetedAccessoryReanalysis,
        executed_detector_passes: 0,
        accepted_detection_count: 0,
        rejected_detection_count: 0,
        publication_changed: false,
        color_changed: false,
      };
    }
    const semanticPublicationConstraints = buildSemanticPublicationConstraintsV1({
      reconciliation: semanticReconciliation,
      outfitAnalysis,
    });
    if (
      semanticPublicationConstraints.confirmed_pieces.length ||
      semanticPublicationConstraints.suppressed_pieces.length
    ) {
      outfitAnalysis = buildOutfitAnalysis({
        dominantHex: analysis.dominantHex,
        topColors: analysis.topColors,
        segmentedRegions,
        decodedImage: analysis.decodedImage,
        perception_v6_mode: MARKET_PERCEPTION_V6_MODE,
        dinoGarmentRegions: analysis.dinoGarmentRegions,
        pipeline: analysis.pipeline,
        semanticConstraints: semanticPublicationConstraints,
      });
      outfitAnalysis = {
        ...outfitAnalysis,
        capture_quality_v1: captureQuality,
      };
      outfitAnalysis.consumer_evidence_v1 = buildConsumerEvidenceV1({
        outfitAnalysis,
        captureQuality,
      });
      semanticReconciliation = reconcileExternalSemanticsV1({
        handoff: externalSemantic?.handoff,
        outfitAnalysis,
      });
    }
    outfitAnalysis = applySemanticIntrinsicPublicationV1({
      outfitAnalysis,
      regions: semanticIntrinsicRemeasurement.regions,
      summary: semanticIntrinsicRemeasurement.summary,
      semanticHandoff: externalSemantic?.handoff,
    });
    outfitAnalysis = applyUnresolvedMeasurementIntegrityGateV1(outfitAnalysis, { runtimeSecondPass });
    outfitAnalysis = {
      ...outfitAnalysis,
      semantic_scene_graph_v1: analysis.semantic_scene_graph_v1,
    };
    outfitAnalysis = sanitizeCustomerFacingZonesV1(outfitAnalysis);
    // Semantic layer reassignment occurs during sanitization. Re-evaluate the
    // final zone ownership and unresolved per-piece retry state, then scrub any
    // newly withheld color aliases through the same canonical sanitizer.
    outfitAnalysis = applyUnresolvedMeasurementIntegrityGateV1(outfitAnalysis, { runtimeSecondPass });
    outfitAnalysis = sanitizeCustomerFacingZonesV1(outfitAnalysis);
    outfitAnalysis = {
      ...outfitAnalysis,
      external_intelligence: {
        ...(outfitAnalysis?.external_intelligence || {}),
        semantic_reconciliation: semanticReconciliation,
        runtime_second_pass_v1: runtimeSecondPass,
        semantic_intrinsic_remeasurement_v1: outfitAnalysis?.piece_color_ownership_v1?.semantic_intrinsic_publication_v1?.remeasurement_summary
          || semanticIntrinsicRemeasurement.summary,
      },
    };
    outfitAnalysis.consumer_evidence_v1 = buildConsumerEvidenceV1({
      outfitAnalysis,
      captureQuality,
    });
    console.info("[EXTERNAL INTELLIGENCE] semantic observer", {
      configured_mode: EXTERNAL_INTELLIGENCE_MODE,
      effective_mode: effectiveExternalIntelligenceMode,
      model: OPENAI_SEMANTIC_MODEL,
      ok: externalSemantic.ok,
      skipped: externalSemantic.skipped,
      cached: externalSemantic.cached,
      reason: externalSemantic.reason || null,
      disposition: externalSemantic?.handoff?.disposition || null,
      publication_changed: externalSemantic?.handoff?.publication_changed || false,
      latency_ms: externalSemantic.latency_ms || 0,
      estimated_cost_usd: externalSemantic.estimated_cost_usd || 0,
      provider_status: externalSemantic.provider_status || null,
      provider_error_code: externalSemantic.provider_error_code || null,
      provider_error_type: externalSemantic.provider_error_type || null,
      provider_error_name: externalSemantic.provider_error_name || null,
      failure_stage: externalSemantic.failure_stage || null,
    });

    return res.json({
      success: true,
      engine: "V2",
      ghostImageUrl: ghostUrl,
      dominantHex: v2.dominantHex,
      dominantName: v2.dominantName,
      garmentColorFamily: v2.classification.family,
      colorLane: v2.classification.lane,
      classification: v2.classification,
      topColors: analysis.topColors,
      palettes: v2.palettes,
      captureQuality,
      outfit_analysis: outfitAnalysis,
      debug: {
        dino: analysis.dino_debug,
        dino_lifecycle_trace: {
          target_id: "dino_4",
          stages: [
            analysis?.dino_debug?.dino_4_lifecycle_stage,
            ...((outfitAnalysis?.dino_lifecycle_trace?.stages || []).filter((stage) => stage?.stage !== "debug.dino.garment_regions")),
          ].filter(Boolean),
          change_summary: buildDinoLifecycleChangeSummary([
            analysis?.dino_debug?.dino_4_lifecycle_stage,
            ...((outfitAnalysis?.dino_lifecycle_trace?.stages || []).filter((stage) => stage?.stage !== "debug.dino.garment_regions")),
          ].filter(Boolean)),
        },
        pipeline: {
          ...analysis.pipeline,
          semantic_scene_graph_v1: analysis.semantic_scene_graph_v1,
          target_conditioned_segmentation_plan_v1: analysis.target_conditioned_segmentation_plan_v1,
          lower_sampling_version: LOWER_SAMPLING_VERSION,
          transform_latency_budget_v1: transformLatencyBudget.snapshot("response"),
        },
        external_intelligence: {
          configured_mode: EXTERNAL_INTELLIGENCE_MODE,
          mode: effectiveExternalIntelligenceMode,
          model: OPENAI_SEMANTIC_MODEL,
          configured: !!process.env.OPENAI_API_KEY,
          ok: externalSemantic.ok,
          skipped: externalSemantic.skipped,
          cached: externalSemantic.cached || false,
          reason: externalSemantic.reason || null,
          provider_status: externalSemantic.provider_status || null,
          provider_error_code: externalSemantic.provider_error_code || null,
          provider_error_type: externalSemantic.provider_error_type || null,
          provider_error_name: externalSemantic.provider_error_name || null,
          failure_stage: externalSemantic.failure_stage || null,
          disposition: externalSemantic?.handoff?.disposition || null,
          semantic_reconciliation: semanticReconciliation,
          runtime_second_pass_v1: runtimeSecondPass,
          semantic_intrinsic_remeasurement_v1: semanticIntrinsicRemeasurement.summary,
          accessory_intelligence_lane: accessoryIntelligenceLane,
          targeted_accessory_reanalysis: targetedAccessoryReanalysis,
          accessory_recovery_priority_v1: {
            applied: accessoryRecoveryPrioritizedOverExternalObserver,
            required_by_local_color_challenge: localAccessoryRecoveryRequired,
            forced_targets: preExternalForcedAccessoryTargets,
            external_observer_minimum_remaining_ms: externalObserverMinimumRemainingMs,
            accessory_reanalysis_budget_ms: ACCESSORY_REANALYSIS_BUDGET_MS,
            accessory_reanalysis_minimum_remaining_ms: accessoryReanalysisMinimumRemainingMs,
            response_reserve_counted_ms: transformLatencyBudget.reserve_ms,
          },
          semantic_publication_policy: semanticPublicationConstraints,
          publication_changed: Boolean(
            semanticPublicationConstraints.confirmed_pieces.length ||
            semanticPublicationConstraints.suppressed_pieces.length
          ),
          authority_owner: "visioncore",
        },
        capture_quality: captureQuality,
      },
      summary: captureQuality?.disposition === "retake"
        ? "The photograph cannot support a defensible intrinsic-color estimate. Retake it using the capture guidance."
        : "Primary color detected. Use Balance, Contrast, Cohesion, Natural, or Explore for structured mode-specific directions.",
    });
  } catch (err) {
    console.error("transform error:", err?.message || err);
    return res.status(500).json({
      success: false,
      step: "transform_unknown",
      error: err?.message || "Unknown error",
    });
  }
});

app.post("/api/recommendations", async (req, res) => {
  try {
    const {
      ghostImageUrl,
      mode,
      itemType,
      sourceItem,
      targetItem,
      industry,
      matchStrictness,
      resultCount,
      inventory,
      occasion,
      usePreviewInventory = true,
    } = req.body || {};

    if (!ghostImageUrl) {
      return res.status(400).json({
        success: false,
        error: "ghostImageUrl is required",
      });
    }

    let analysis;
    try {
      analysis = await analyzeGhostColors(ghostImageUrl);
    } catch (error) {
      return sendStepError(res, 500, "analyze_cloudinary_colors", error);
    }

    let v2;
    let outfitAnalysis;
    try {
      v2 = generatePalettesV2(analysis.dominantHex);
      outfitAnalysis = buildOutfitAnalysis({
        dominantHex: analysis.dominantHex,
        topColors: analysis.topColors,
        segmentedRegions: analysis.segmentedRegions,
        dinoGarmentRegions: analysis.dinoGarmentRegions,
        pipeline: analysis.pipeline,
        decodedImage: analysis.decodedImage,
        perception_v6_mode: MARKET_PERCEPTION_V6_MODE,
      });
    } catch (error) {
      return sendStepError(res, 500, "palette_engine", error);
    }

    const m = String(mode || "").toLowerCase().trim();
    const modeMap = {
      balance: "balance",
      contrast: "contrast",
      cohesion: "cohesion",
      emphasis: "emphasis",
      natural: "natural",
      explore: "explore",
      neutrals: "balance",
      earth: "natural",
      earthtones: "natural",
      earth_tones: "natural",
      bold: "emphasis",
    };

    const key = modeMap[m] || "balance";
    const pack = v2.palettes[key];

    let retrievalIntent = null;
    let rankedProducts = null;
    let shoppingAssist = null;

    if (targetItem) {
      retrievalIntent = buildRetrievalIntent(outfitAnalysis, {
        selectedMode: mode,
        sourceItem: sourceItem || itemType || "piece",
        targetItem,
        industry: industry || "fashion",
        matchStrictness: matchStrictness || "medium",
        resultCount: resultCount || 24,
        occasion,
      });

      const inputInventory =
        Array.isArray(inventory) && inventory.length
          ? inventory
          : usePreviewInventory
            ? generateRetrievalPreviewProducts(retrievalIntent)
            : [];

      rankedProducts = inputInventory.length ? rankProducts(inputInventory, retrievalIntent) : [];
      shoppingAssist = buildShoppingAssist(outfitAnalysis, retrievalIntent, rankedProducts);
    }

    return res.json({
      success: true,
      engine: "V2",
      mode: key,
      itemType: itemType || null,
      dominantHex: v2.dominantHex,
      dominantName: v2.dominantName,
      garmentColorFamily: v2.classification.family,
      colorLane: v2.classification.lane,
      recommendation: {
        paletteHexes: pack.hexes,
        paletteNamedHexes: pack.named_hexes,
        reason: pack.reason,
      },
      retrieval_intent: retrievalIntent,
      ranked_products: rankedProducts,
      shopping_assist: shoppingAssist,
    });
  } catch (err) {
    console.error("recommendations error:", err?.message || err);
    return res.status(500).json({
      success: false,
      step: "recommendations_unknown",
      error: err?.message || "Unknown error",
    });
  }
});

app.post("/api/retrieval/preview", async (req, res) => {
  try {
    const {
      ghostImageUrl,
      outfitAnalysis: providedOutfitAnalysis,
      sourceItem,
      targetItem,
      selectedMode,
      industry,
      matchStrictness,
      resultCount,
      inventory,
      occasion,
      usePreviewInventory = true,
    } = req.body || {};

    if (!providedOutfitAnalysis && !ghostImageUrl) {
      return res.status(400).json({
        success: false,
        error: "Provide either outfitAnalysis or ghostImageUrl.",
      });
    }

    let outfitAnalysis = providedOutfitAnalysis || null;
    let dominantHex = null;
    let dominantName = null;

    if (!outfitAnalysis && ghostImageUrl) {
      let analysis;
      try {
        analysis = await analyzeGhostColors(ghostImageUrl);
      } catch (error) {
        return sendStepError(res, 500, "analyze_cloudinary_colors", error);
      }

      dominantHex = analysis.dominantHex;
      dominantName = analysis.dominantName;

      try {
        outfitAnalysis = buildOutfitAnalysis({
          dominantHex: analysis.dominantHex,
          topColors: analysis.topColors,
          segmentedRegions: analysis.segmentedRegions,
          decodedImage: analysis.decodedImage,
        perception_v6_mode: MARKET_PERCEPTION_V6_MODE,
          dinoGarmentRegions: analysis.dinoGarmentRegions,
          pipeline: analysis.pipeline,
        });
      } catch (error) {
        return sendStepError(res, 500, "palette_engine", error);
      }
    }

    const retrievalIntent = buildRetrievalIntent(outfitAnalysis, {
      selectedMode,
      sourceItem: sourceItem || "piece",
      targetItem,
      industry: industry || "fashion",
      matchStrictness: matchStrictness || "medium",
      resultCount: resultCount || 24,
      occasion,
    });

    const inputInventory =
      Array.isArray(inventory) && inventory.length
        ? inventory
        : usePreviewInventory
          ? generateRetrievalPreviewProducts(retrievalIntent)
          : [];

    const rankedProducts = rankProducts(inputInventory, retrievalIntent);
    const shoppingAssist = buildShoppingAssist(outfitAnalysis, retrievalIntent, rankedProducts);

    return res.json({
      success: true,
      engine: "V2",
      dominantHex,
      dominantName,
      outfit_analysis: outfitAnalysis,
      retrieval_intent: retrievalIntent,
      ranked_products: rankedProducts,
      shopping_assist: shoppingAssist,
      summary:
        "Retrieval preview generated. VisionCore used selected mode, target piece, color roles, and piece scoring to rank products.",
    });
  } catch (err) {
    console.error("retrieval/preview error:", err?.message || err);
    return res.status(500).json({
      success: false,
      step: "retrieval_preview_unknown",
      error: err?.message || "Unknown error",
    });
  }
});

/* =========================
   MULTER ERROR HANDLER
========================= */
app.use((err, _req, res, _next) => {
  if (err?.name === "MulterError") {
    return res.status(400).json({
      success: false,
      step: "multer_parse",
      error: err.message || "Upload failed: server could not parse your image.",
    });
  }

  if (String(err?.message || "").toLowerCase().includes("multipart")) {
    return res.status(400).json({
      success: false,
      step: "multer_parse",
      error: "Upload failed: malformed multipart request.",
    });
  }

  return res.status(500).json({
    success: false,
    step: "server_error",
    error: err?.message || "Server error",
  });
});

/* =========================
   START
========================= */
if (process.env.NODE_ENV !== "test") {
  app.listen(PORT, () => {
    console.log(`✅ CIE Core backend running on port ${PORT}`);
  });
}


export {
  buildOutfitAnalysis,
  inferZoneColorRead,
  inferGarmentZones,
  MARKET_PERCEPTION_V6_MODE,
  extractDinoBboxRegionColors,
  extractMaskedRegionColors,
};
