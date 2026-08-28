Warning: truncated output (original token count: 79313)
Total output lines: 8251

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
import { applyLowerGarmentPurityV2 } from "./intelligence/lowerGarmentPurityV2.js";
import { applyUpperGarmentPurityV1 } from "./intelligence/upperGarmentPurityV1.js";
import { buildPublishedGarmentZonesV2 } from "./intelligence/publishedGarmentZonesV2.js";
import { applySignatureColorAuthorityV2 } from "./intelligence/signatureColorAuthorityV2.js";
import { buildSceneOwnershipV1 } from "./intelligence/sceneOwnershipV1.js";
import { runOpenAISemanticObserverV1 } from "./intelligence/external/openaiSemanticObserverV1.js";
import { reconcileExternalSemanticsV1 } from "./intelligence/external/semanticReconciliationV1.js";
import { buildSemanticPublicationConstraintsV1 } from "./intelligence/external/semanticPublicationPolicyV1.js";
import { attachBeltLocalizationV1 } from "./intelligence/beltLocalizationV1.js";
import { resolveMaskStrengthV1, resolveOpaqueMaskStrengthV1 } from "./intelligence/maskStrengthV1.js";
import { normalizeExternalIntelligenceMode } from "./intelligence/visionCoreExternalIntelligencePolicyV1.js";
import { evaluateCaptureQualityV1 } from "./intelligence/captureQualityGateV1.js";
import { buildConsumerEvidenceV1 } from "./intelligence/consumerEvidenceV1.js";
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

let scoreEngine = null;
try {
  scoreEngine = await import("./engines/score/index.js");
} catch (error) {
  console.warn("Score engine unavailable; using legacy scoring fallback.", error?.message || error);
}

dotenv.config();

const app = express();
const PORT = process.env.PORT || 10000;
const PIXELCUT_TIMEOUT_MS = 45000;
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
// Market default is shadow: OpenAI may observe semantics when a protected key is
// present, but it can never change color math or publication. Missing credentials
// still skip cleanly and preserve the VisionCore result.
const EXTERNAL_INTELLIGENCE_MODE = normalizeExternalIntelligenceMode(process.env.VISIONCORE_EXTERNAL_INTELLIGENCE_MODE, "shadow");
const OPENAI_SEMANTIC_MODEL = process.env.OPENAI_SEMANTIC_MODEL || "gpt-5.6-luna";
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
      VISIONCORE_EXTERNAL_INTELLIGENCE_MODE: EXTERNAL_INTELLIGENCE_MODE,
      OPENAI_SEMANTIC_MODEL,
    },
  });
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
  const read = {
    hex: safe,
    name: color?.name || getColorName(safe),
    pct: round2(color?.pct || 0),
  };
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
  const pct = round2(normalizeColorPct(color?.pct));
  return withColorIdentity({
    hex,
    name: color?.name || getColorName(hex),
    pct,
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
    if (existing) {
      existing.pct = round2(normalizeColorPct(existing.pct) + pct);
      existing.percentage = formatColorPct(existing.pct);
      if (pct > Number(existing._topPct || 0)) {
        existing.hex = compact.hex;
        existing.color_identity = compact.color_identity;
        existing._topPct = pct;
      }
    } else {
      groups.set(key, { ...compact, pct, percentage: formatColorPct(pct), _topPct: pct });
    }
  }
  const mergedColors = Array.from(groups.values());
  const totalPct = mergedColors.reduce((sum, color) => sum + normalizeColorPct(color?.pct), 0);
  return mergedColors
    .map(({ _topPct, ...color }) => {
      const displayPct = totalPct > 0 ? normalizeColorPct(color.pct) / totalPct : 0;
      return withColorIdentity({
        ...color,
        display_pct: round2(displayPct),
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
  const reason = sorted.length > 0 && topPct < 0.55
    ? "top_pct_lt_0_55"
    : secondPct >= 0.18
      ? "second_pct_gte_0_18"
      : meaningfulCount >= 3
        ? "three_colors_pct_gte_0_08"
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
    if (!hex || !primaryHex || !isMateriallyDistinctGarmentColor(primaryHex, hex)) return false;
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
  const dominantColor = preservedAccessoryColor || withColorIdentity({
    hex: dominantReadCluster.base,
    name: getColorName(dominantReadCluster.base),
    pct: round2(dominantReadCluster.pct),
  });
  const summaryColorReadClusters = mergeClusterSummaryFamilies(colorReadClusters);
  const supportColors = summaryColorReadClusters.slice(1, 4).map((c) => withColorIdentity({
    hex: c.hex,
    name: c.name,
    pct: round2(c.pct),
  }));
  const accentColors = summaryColorReadClusters.slice(4, 6).map((c) => withColorIdentity({
    hex: c.hex,
    name: c.name,
    pct: round2(c.pct),
  }));
  const summaryPrimaryColor = preservedAccessoryColor || (summaryColorReadClusters[0]
    ? withColorIdentity({
        hex: summaryColorReadClusters[0].hex,
        name: summaryColorReadClusters[0].name,
        pct: round2(summaryColorReadClusters[0].pct),
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
        detector: rawDetectorPalette,…39313 tokens truncated… catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("Replicate SAM timed out");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function isTransientPollingError(error) {
  const message = String(error?.message || error || "").toLowerCase();
  if (!message) return false;
  return (
    message.includes("fetch failed") ||
    message.includes("network") ||
    message.includes("econnreset") ||
    message.includes("etimedout") ||
    message.includes("socket hang up") ||
    message.includes("temporar") ||
    message.includes("eai_again")
  );
}

function isReplicateThrottleError(errorOrReason) {
  const message = String(errorOrReason?.message || errorOrReason || "").toLowerCase();
  if (!message) return false;
  return (
    message.includes("rate limit") ||
    message.includes("rate-limit") ||
    message.includes("ratelimit") ||
    message.includes("too many requests") ||
    message.includes("thrott") ||
    message.includes("429")
  );
}

function randomPollRetryDelayMs() {
  const min = REPLICATE_SAM_POLL_RETRY_DELAY_MIN_MS;
  const max = REPLICATE_SAM_POLL_RETRY_DELAY_MAX_MS;
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function normalizeGroundingDinoBbox(rawBbox) {
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
    values = [Number(x1), Number(y1), Number(x2 ?? Number(x1) + Number(w)), Number(y2 ?? Number(y1) + Number(h))];
  }

  if (!values || values.some((value) => !Number.isFinite(value))) return null;
  let [x1, y1, x2, y2] = values;
  if (x2 < x1) [x1, x2] = [x2, x1];
  if (y2 < y1) [y1, y2] = [y2, y1];

  return {
    x_min: round2(x1),
    y_min: round2(y1),
    x_max: round2(x2),
    y_max: round2(y2),
    width: round2(Math.max(0, x2 - x1)),
    height: round2(Math.max(0, y2 - y1)),
  };
}


function getNormalizedDinoRegionBBox(bbox = null) {
  if (!bbox) return null;
  const xMin = Number(bbox.x_min);
  const yMin = Number(bbox.y_min);
  const xMax = Number(bbox.x_max);
  const yMax = Number(bbox.y_max);
  if (![xMin, yMin, xMax, yMax].every(Number.isFinite)) return null;
  if (xMin < 0 || yMin < 0 || xMax > 1 || yMax > 1) return null;
  if (xMax <= xMin || yMax <= yMin) return null;
  return {
    x: round2(xMin),
    y: round2(yMin),
    w: round2(xMax - xMin),
    h: round2(yMax - yMin),
  };
}

function isIgnoredDinoLabel(label) {
  const normalized = normalizeText(label);
  return ["person", "clothing", "object", "body"].includes(normalized);
}

function getDinoBboxArea(bbox = null) {
  if (!bbox) return 0;
  const width = Number(bbox.width ?? (Number(bbox.x_max) - Number(bbox.x_min)) ?? 0);
  const height = Number(bbox.height ?? (Number(bbox.y_max) - Number(bbox.y_min)) ?? 0);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return 0;
  return round2(width * height);
}


function getRegionBBox(region = {}) {
  return region?.bbox || region?.mask_geometry?.bbox || null;
}

function getBboxIoU(a = null, b = null) {
  const boxA = normalizeGroundingDinoBbox(a) || a;
  const boxB = normalizeGroundingDinoBbox(b) || b;
  if (!boxA || !boxB) return 0;
  const ax1 = Number(boxA.x_min ?? boxA.x ?? 0);
  const ay1 = Number(boxA.y_min ?? boxA.y ?? 0);
  const ax2 = Number(boxA.x_max ?? (Number(boxA.x || 0) + Number(boxA.w || 0)));
  const ay2 = Number(boxA.y_max ?? (Number(boxA.y || 0) + Number(boxA.h || 0)));
  const bx1 = Number(boxB.x_min ?? boxB.x ?? 0);
  const by1 = Number(boxB.y_min ?? boxB.y ?? 0);
  const bx2 = Number(boxB.x_max ?? (Number(boxB.x || 0) + Number(boxB.w || 0)));
  const by2 = Number(boxB.y_max ?? (Number(boxB.y || 0) + Number(boxB.h || 0)));
  if (![ax1, ay1, ax2, ay2, bx1, by1, bx2, by2].every(Number.isFinite)) return 0;
  const ix1 = Math.max(ax1, bx1);
  const iy1 = Math.max(ay1, by1);
  const ix2 = Math.min(ax2, bx2);
  const iy2 = Math.min(ay2, by2);
  const intersection = Math.max(0, ix2 - ix1) * Math.max(0, iy2 - iy1);
  const areaA = Math.max(0, ax2 - ax1) * Math.max(0, ay2 - ay1);
  const areaB = Math.max(0, bx2 - bx1) * Math.max(0, by2 - by1);
  const union = areaA + areaB - intersection;
  return union > 0 ? intersection / union : 0;
}

function mergeRegionColors(...colorLists) {
  return buildColorClusters(colorLists.flat().filter(Boolean))
    .map((c) => compactRegionColor({ hex: c.base, pct: c.pct }))
    .filter(Boolean);
}

function isHeadwearAccessoryDinoRegion(region = {}) {
  if (region?.zone !== "accessory_jewelry") return false;
  const text = [
    region?.label,
    region?.category,
    region?.accessory,
    region?.display_label,
    region?.segment_label,
    region?.name,
  ].map(normalizeText).filter(Boolean).join(" ");
  return /\b(hat|cap|beanie|headwear|head\s*wear|beret|visor|helmet|bonnet|fedora|bucket\s*hat|baseball\s*cap|skullcap|toque)\b/.test(text);
}

function getStrongDominantDinoRegionColor(region = {}) {
  const dominantHex = safeHex(region?.dominant_hex);
  const topColor = Array.isArray(region?.region_colors) ? region.region_colors[0] : null;
  const topHex = safeHex(topColor?.hex);
  const topPct = normalizeColorPct(topColor?.pct);
  if (!dominantHex || !topHex || topPct < 0.65) return null;
  const closeToDominant = topHex === dominantHex || colorDistanceLab(topHex, dominantHex) <= 10;
  if (!closeToDominant) return null;
  return compactRegionColor({ ...topColor, hex: dominantHex, pct: topPct });
}

function preferPreservedRegionColorFirst(regionColors = [], preservedColor = null) {
  const compactPreserved = compactRegionColor(preservedColor);
  if (!compactPreserved?.hex) return regionColors;
  return [
    compactPreserved,
    ...(regionColors || []).filter((color) => safeHex(color?.hex) !== compactPreserved.hex),
  ];
}

function dedupeDinoRegionsByZoneAndOverlap(regions = [], overlapThreshold = 0.72) {
  const merged = [];
  for (const region of regions || []) {
    const zone = region?.zone || "unknown";
    const bbox = getRegionBBox(region);
    const accessoryIdentity = zone === "accessory_jewelry"
      ? inferAccessoryDisplayMetadata([
          region?.object_type,
          region?.accessory_type,
          region?.label,
          region?.segment_label,
        ]).accessory_type
      : null;
    const matchIndex = merged.findIndex((candidate) =>
      candidate?.zone === zone &&
      (zone !== "accessory_jewelry" || inferAccessoryDisplayMetadata([
        candidate?.object_type,
        candidate?.accessory_type,
        candidate?.label,
        candidate?.segment_label,
      ]).accessory_type === accessoryIdentity) &&
      bbox && getRegionBBox(candidate) && getBboxIoU(bbox, getRegionBBox(candidate)) >= overlapThreshold
    );

    if (matchIndex < 0) {
      merged.push(region);
      continue;
    }

    const current = merged[matchIndex];
    const best = Number(region?.confidence || 0) > Number(current?.confidence || 0) ? region : current;
    const other = best === region ? current : region;
    const mergedShape = { ...other, ...best };
    const regionColors = mergeRegionColors(current?.region_colors || [], region?.region_colors || []);
    const strongDominantCandidates = [current, region]
      .map((candidate) => ({
        region: candidate,
        color: getStrongDominantDinoRegionColor(candidate),
      }))
      .filter((candidate) => candidate.color?.hex)
      .sort((a, b) => normalizeColorPct(b.color?.pct) - normalizeColorPct(a.color?.pct));
    const preservedDominant = isHeadwearAccessoryDinoRegion({ ...mergedShape, zone })
      ? strongDominantCandidates[0] || null
      : null;
    const mergedRegionColors = preferPreservedRegionColorFirst(regionColors, preservedDominant?.color);
    const dominant = preservedDominant?.color?.hex || mergedRegionColors[0]?.hex || safeHex(best?.dominant_hex || other?.dominant_hex || "") || null;

    merged[matchIndex] = {
      ...mergedShape,
      confidence: Math.max(Number(current?.confidence || 0), Number(region?.confidence || 0)),
      coverage: round2(Math.max(Number(current?.coverage || 0), Number(region?.coverage || 0))),
      dominant_hex: dominant,
      region_colors: mergedRegionColors,
      mask_geometry: best?.mask_geometry || other?.mask_geometry || null,
      duplicate_detection_ids: [
        ...(Array.isArray(current?.duplicate_detection_ids) ? current.duplicate_detection_ids : [current?.id].filter(Boolean)),
        region?.id,
      ].filter(Boolean),
      ...(preservedDominant?.color?.hex ? {
        dedupe_preserved_dominant_hex: preservedDominant.color.hex,
        dedupe_preserved_from_id: preservedDominant.region?.id || null,
        dedupe_preservation_reason: "headwear_accessory_confident_top_color",
      } : {}),
    };
  }
  return merged;
}

function buildDinoSegmentedRegions(detections = []) {
  if (!Array.isArray(detections) || !detections.length) return [];

  return detections
    .map((detection, idx) => {
      if (isIgnoredDinoLabel(detection?.label)) return null;

      const mapping = mapDinoLabel(detection?.label);
      if (!mapping?.zone || mapping.zone === "unknown") return null;

      const confidence = Math.round(clamp100(Number(detection?.confidence || 0) * 100));
      if (confidence < Math.round(clamp100(Number(mapping?.confidence_floor || 0) * 100))) return null;

      const bbox = detection?.bbox || null;
      const bboxArea = getDinoBboxArea(bbox);

      return {
        id: `dino_${idx + 1}`,
        segment_label: mapping.label || detection?.label || `dino_${idx + 1}`,
        label: detection?.label || mapping.label || "object",
        category: mapping.category || "piece",
        zone: mapping.zone,
        display_zone_label: mapping.display_zone_label || null,
        accessory_type: mapping.accessory_type || null,
        object_type: mapping.object_type || null,
        confidence,
        source_type: "grounding_dino",
        bbox,
        coverage: bboxArea,
        dominant_hex: null,
        region_colors: [],
        mask_geometry: bbox ? { bbox, coverage: bboxArea } : null,
        color_debug: null,
      };
    })
    .filter(Boolean);
}

function buildDinoGarmentRegions(detections = []) {
  return buildDinoSegmentedRegions(detections);
}


function getGarmentZoneSource(samRegions = [], dinoRegions = []) {
  const hasSam = Array.isArray(samRegions) && samRegions.length > 0;
  const hasDino = Array.isArray(dinoRegions) && dinoRegions.length > 0;
  if (hasSam && hasDino) return "hybrid";
  if (hasSam) return "sam";
  if (hasDino) return "dino";
  return "none";
}

function parseGroundingDinoOutputToDetections(output) {
  if (!output) return [];

  const boxes = Array.isArray(output?.boxes) ? output.boxes : [];
  const labels = Array.isArray(output?.labels)
    ? output.labels
    : Array.isArray(output?.phrases)
      ? output.phrases
      : Array.isArray(output?.detected_labels)
        ? output.detected_labels
        : [];
  const scores = Array.isArray(output?.scores)
    ? output.scores
    : Array.isArray(output?.logits)
      ? output.logits
      : Array.isArray(output?.confidences)
        ? output.confidences
        : [];

  const rows = Array.isArray(output)
    ? output
    : Array.isArray(output?.detections)
      ? output.detections
      : Array.isArray(output?.predictions)
        ? output.predictions
        : boxes.map((box, idx) => ({
            bbox: box,
            label: labels[idx],
            confidence: scores[idx],
          }));

  return rows
    .map((row, idx) => {
      const label = String(row?.label || row?.class || row?.name || row?.phrase || row?.text || labels[idx] || "object")
        .trim()
        .toLowerCase();
      const confidenceValue = row?.confidence ?? row?.score ?? row?.logit ?? row?.probability ?? scores[idx] ?? 0;
      const confidence = clamp01(Number(confidenceValue));
      const bbox = normalizeGroundingDinoBbox(row?.bbox || row?.box || row?.bounding_box || row?.bounds || boxes[idx]);

      return {
        label: label || "object",
        confidence: round2(confidence),
        bbox,
      };
    })
    .filter((detection) => {
      if (!detection) return false;
      if (!detection.bbox) return true;
      return Number(detection.bbox.width || 0) > 0 && Number(detection.bbox.height || 0) > 0;
    });
}

function parseSamOutputToRegions(output) {
  if (!output) return [];

  if (Array.isArray(output?.individual_masks)) {
    return output.individual_masks.map((maskUrl, idx) => ({
      id: `sam_${idx + 1}`,
      segment_label: `segment_${idx + 1}`,
      zone: "unknown",
      confidence: 70,
      coverage: 0.2,
      mask_url: maskUrl,
      dominant_hex: null,
      region_colors: [],
      source_type: "sam_segment",
    }));
  }

  const rows = Array.isArray(output)
    ? output
    : Array.isArray(output?.segments)
      ? output.segments
      : Array.isArray(output?.predictions)
        ? output.predictions
        : [];

  return rows
    .map((row, idx) => {
      const segmentLabel = String(
        row?.label || row?.class || row?.name || row?.segment_label || `segment_${idx + 1}`
      );
      const zone = getZoneFromLabel(segmentLabel);

      return {
        id: row?.id || `sam_${idx + 1}`,
        segment_label: segmentLabel,
        zone,
        confidence: Math.round(clamp100(Number(row?.confidence || row?.score || 65))),
        coverage: clamp01(Number(row?.coverage || row?.area || row?.weight || 0.2)),
        mask_url: row?.mask || row?.mask_url || row?.url || null,
        dominant_hex: safeHex(row?.dominant_hex || row?.hex || row?.color || ""),
        region_colors: [],
        source_type: "sam_segment",
      };
    })
    .filter((r) => r.zone !== "unknown" || r.mask_url || r.dominant_hex);
}

async function fetchImageBuffer(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Failed to fetch image (${resp.status})`);
  const arr = await resp.arrayBuffer();
  return Buffer.from(arr);
}

function decodeImageRgba(buffer, urlHint = "") {
  const hint = String(urlHint || "").toLowerCase();

  if (hint.includes(".png")) {
    try {
      const png = PNG.sync.read(buffer);
      return { width: png.width, height: png.height, data: png.data };
    } catch {}
  }

  try {
    const jpg = jpeg.decode(buffer, { useTArray: true });
    return { width: jpg.width, height: jpg.height, data: jpg.data };
  } catch {}

  try {
    const png = PNG.sync.read(buffer);
    return { width: png.width, height: png.height, data: png.data };
  } catch {}

  throw new Error("Unsupported image format");
}

function getMaskStrength(maskRgba, idx) {
  return resolveMaskStrengthV1(
    maskRgba[idx],
    maskRgba[idx + 1],
    maskRgba[idx + 2],
    maskRgba[idx + 3]
  );
}

function createMaskStrengthReader(maskImage = {}) {
  const width = Number(maskImage?.width || 0);
  const height = Number(maskImage?.height || 0);
  const data = maskImage?.data;
  if (!width || !height || !data) return () => 0;
  const cornerIndexes = [
    0,
    (width - 1) * 4,
    ((height - 1) * width) * 4,
    ((height * width) - 1) * 4,
  ];
  const fullyOpaque = cornerIndexes.every((idx) => Number(data[idx + 3] || 0) >= 250);
  if (!fullyOpaque) return (idx) => getMaskStrength(data, idx);
  const cornerIntensities = cornerIndexes
    .map((idx) => (Number(data[idx] || 0) + Number(data[idx + 1] || 0) + Number(data[idx + 2] || 0)) / 3)
    .sort((a, b) => a - b);
  const backgroundIntensity = (cornerIntensities[1] + cornerIntensities[2]) / 2;
  return (idx) => resolveOpaqueMaskStrengthV1(data[idx], data[idx + 1], data[idx + 2], backgroundIntensity);
}

function extractMaskedRegionColors(baseImage, maskImage, limit = 6) {
  const baseW = Number(baseImage?.width || 0);
  const baseH = Number(baseImage?.height || 0);
  const maskW = Number(maskImage?.width || 0);
  const maskH = Number(maskImage?.height || 0);
  if (!baseW || !baseH || !maskW || !maskH) return [];
  const maskStrengthAt = createMaskStrengthReader(maskImage);

  const buckets = new Map();
  let pixelCount = 0;

  for (let my = 0; my < maskH; my += 1) {
    for (let mx = 0; mx < maskW; mx += 1) {
      const mIdx = (my * maskW + mx) * 4;
      if (maskStrengthAt(mIdx) < 25) continue;

      const bx = Math.max(0, Math.min(baseW - 1, Math.floor((mx / maskW) * baseW)));
      const by = Math.max(0, Math.min(baseH - 1, Math.floor((my / maskH) * baseH)));
      const bIdx = (by * baseW + bx) * 4;
      const alpha = Number(baseImage.data[bIdx + 3] || 0);
      if (alpha < 20) continue;

      const r = Number(baseImage.data[bIdx] || 0);
      const g = Number(baseImage.data[bIdx + 1] || 0);
      const b = Number(baseImage.data[bIdx + 2] || 0);
      const key = `${Math.round(r / 16)}_${Math.round(g / 16)}_${Math.round(b / 16)}`;

      if (!buckets.has(key)) buckets.set(key, { count: 0, rSum: 0, gSum: 0, bSum: 0 });
      const row = buckets.get(key);
      row.count += 1;
      row.rSum += r;
      row.gSum += g;
      row.bSum += b;
      pixelCount += 1;
    }
  }

  if (!pixelCount) return [];

  return Array.from(buckets.values())
    .map((row) => {
      const hex = safeHex(
        chroma(
          Math.round(row.rSum / row.count),
          Math.round(row.gSum / row.count),
          Math.round(row.bSum / row.count)
        ).hex()
      );
      return {
        hex,
        pct: row.count / pixelCount,
      };
    })
    .filter((c) => !!c.hex)
    .sort((a, b) => b.pct - a.pct)
    .slice(0, limit);
}


function getPixelBboxFromDinoBbox(bbox = null, imageWidth = 0, imageHeight = 0) {
  if (!bbox || !imageWidth || !imageHeight) return null;
  const xMin = Number(bbox.x_min);
  const yMin = Number(bbox.y_min);
  const xMax = Number(bbox.x_max);
  const yMax = Number(bbox.y_max);
  if (![xMin, yMin, xMax, yMax].every(Number.isFinite)) return null;
  const normalized = xMin >= 0 && yMin >= 0 && xMax <= 1 && yMax <= 1;
  const left = normalized ? xMin * imageWidth : xMin;
  const top = normalized ? yMin * imageHeight : yMin;
  const right = normalized ? xMax * imageWidth : xMax;
  const bottom = normalized ? yMax * imageHeight : yMax;
  const x1 = Math.max(0, Math.min(imageWidth - 1, Math.floor(Math.min(left, right))));
  const y1 = Math.max(0, Math.min(imageHeight - 1, Math.floor(Math.min(top, bottom))));
  const x2 = Math.max(0, Math.min(imageWidth, Math.ceil(Math.max(left, right))));
  const y2 = Math.max(0, Math.min(imageHeight, Math.ceil(Math.max(top, bottom))));
  if (x2 <= x1 || y2 <= y1) return null;
  return { x1, y1, x2, y2, width: x2 - x1, height: y2 - y1 };
}

function isNearWhiteOrBlackPixel(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max >= 242 || (max <= 18 && max - min <= 12);
}

function getDinoSamplePixelBbox(pixelBbox, zone = "", category = "") {
  return getDinoSamplePixelBboxes(pixelBbox, zone, category)[0];
}

function buildRelativePixelBbox(pixelBbox, xStart, xEnd, yStart, yEnd, label = "center") {
  const x1 = Math.max(pixelBbox.x1, Math.min(pixelBbox.x2 - 1, Math.floor(pixelBbox.x1 + pixelBbox.width * xStart)));
  const x2 = Math.max(x1 + 1, Math.min(pixelBbox.x2, Math.ceil(pixelBbox.x1 + pixelBbox.width * xEnd)));
  const y1 = Math.max(pixelBbox.y1, Math.min(pixelBbox.y2 - 1, Math.floor(pixelBbox.y1 + pixelBbox.height * yStart)));
  const y2 = Math.max(y1 + 1, Math.min(pixelBbox.y2, Math.ceil(pixelBbox.y1 + pixelBbox.height * yEnd)));
  return { label, x1, y1, x2, y2, width: x2 - x1, height: y2 - y1 };
}

function getDinoSamplePixelBboxes(pixelBbox, zone = "", category = "") {
  const zoneKey = normalizeText(zone);
  const categoryKey = normalizeText(category);

  if (zoneKey === "lower_garment") {
    return [
      buildRelativePixelBbox(pixelBbox, 0.24, 0.76, 0.18, 0.46, "upper-center"),
      buildRelativePixelBbox(pixelBbox, 0.10, 0.48, 0.34, 0.70, "left-center"),
      buildRelativePixelBbox(pixelBbox, 0.52, 0.90, 0.34, 0.70, "right-center"),
      buildRelativePixelBbox(pixelBbox, 0.26, 0.74, 0.60, 0.92, "lower-center"),
    ];
  }

  let xStart = 0.18;
  let xEnd = 0.82;
  let yStart = 0.15;
  let yEnd = 0.85;

  if (zoneKey === "upper_garment") {
    xStart = 0.24;
    xEnd = 0.76;
    yStart = 0.12;
    yEnd = 0.75;
  } else if (zoneKey === "footwear") {
    xStart = 0.14;
    xEnd = 0.86;
    yStart = 0.30;
    yEnd = 0.92;
  } else if (zoneKey === "bag") {
    xStart = 0.15;
    xEnd = 0.85;
    yStart = 0.15;
    yEnd = 0.85;
  } else if (zoneKey === "accessory_jewelry" || categoryKey.includes("hat") || categoryKey.includes("accessory")) {
    xStart = 0.20;
    xEnd = 0.80;
    yStart = 0.20;
    yEnd = 0.80;
  }

  return [buildRelativePixelBbox(pixelBbox, xStart, xEnd, yStart, yEnd)];
}

function getRgbTraits(r, g, b) {
  const [h, s, l] = chroma(r, g, b).hsl();
  return {
    hue: Number.isFinite(h) ? h : 0,
    saturation: Number.isFinite(s) ? s : 0,
    lightness: Number.isFinite(l) ? l : 0,
  };
}

function isSkinLikePixel(r, g, b) {
  const { hue, saturation, lightness } = getRgbTraits(r, g, b);
  return hue >= 8 && hue <= 48 && saturation >= 0.16 && saturation <= 0.68 && lightness >= 0.32 && lightness <= 0.82 && r > b && g > b * 0.72;
}

function isChromaticGreenOrOlive(color) {
  const hex = safeHex(color?.hex || color || "");
  if (!hex) return false;
  const [lightness, chromaValue, hue] = chroma(hex).lch();
  return Number.isFinite(hue) && Number.isFinite(chromaValue) && hue >= 55 && hue <= 170 && chromaValue >= 8 && lightness <= 62;
}

function isNeutralDarkColor(color) {
  const hex = safeHex(color?.hex || color || "");
  if (!hex) return false;
  const [hue, saturation, lightness] = chroma(hex).hsl();
  const [, chromaValue] = chroma(hex).lch();
  return lightness <= 0.30 && (!Number.isFinite(hue) || saturation <= 0.18 || chromaValue < 8);
}

function sortLowerGarmentColors(colorRows = [], context = {}) {
  const repeatedGreenSupport = Number(context?.greenWindowSupport || 0) >= 2;
  const greenMultiplier = repeatedGreenSupport ? 2.15 : 1.55;
  return [...colorRows].sort((a, b) => {
    const aGreen = isChromaticGreenOrOlive(a);
    const bGreen = isChromaticGreenOrOlive(b);
    const aNeutralDark = isNeutralDarkColor(a);
    const bNeutralDark = isNeutralDarkColor(b);
    const aScore = a.pct * (aGreen ? greenMultiplier : 1) * (aNeutralDark ? 0.72 : 1);
    const bScore = b.pct * (bGreen ? greenMultiplier : 1) * (bNeutralDark ? 0.72 : 1);
    return bScore - aScore;
  });
}

function isHeadwearDinoContext(context = {}) {
  const values = [
    context?.zone,
    context?.category,
    context?.label,
    context?.object_type,
    context?.accessory_type,
  ].map(normalizeText);
  return values.some((value) => /\b(hat|cap|beanie|headwear)\b/.test(value));
}

function getHeadwearColorBiasScore(cluster = {}) {
  const hex = safeHex(cluster?.base || cluster?.hex || "");
  if (!hex) return 0;
  const hue = getHue(hex);
  const sat = getSat(hex);
  const light = getLight(hex);
  const [, chromaValue] = chroma(hex).lch();
  const pct = Number(cluster?.pct || 0);
  const strongObjectColor = sat >= 0.48 && chromaValue >= 34 && light >= 0.18 && light <= 0.78;
  const saturatedFabricHue =
    (hue >= 345 || hue <= 25) || // red / rose
    (hue >= 185 && hue <= 260) || // blue
    (hue >= 35 && hue <= 175) || // yellow / green
    (hue >= 275 && hue <= 335); // purple / magenta
  if (!strongObjectColor || !saturatedFabricHue || pct < 0.06) return 0;
  return pct * (1 + sat) * (1 + Math.min(chromaValue, 80) / 80);
}

function isMutedSkinLikeHeadwearCluster(cluster = {}) {
  const hex = safeHex(cluster?.base || cluster?.hex || "");
  if (!hex) return false;
  const hue = getHue(hex);
  const sat = getSat(hex);
  const light = getLight(hex);
  const [, chromaValue] = chroma(hex).lch();
  return hue >= 335 || hue <= 55
    ? sat <= 0.34 && chromaValue <= 32 && light >= 0.34 && light <= 0.68
    : false;
}

function applyHeadwearDinoColorBias(clusters = [], context = {}) {
  const preBiasTopHex = safeHex(clusters?.[0]?.base || clusters?.[0]?.hex || "");
  const debug = {
    headwear_color_bias_applied: false,
    pre_bias_top_hex: preBiasTopHex || null,
    post_bias_top_hex: preBiasTopHex || null,
    reason: isHeadwearDinoContext(context) ? "no_meaningful_saturated_headwear_cluster" : "not_headwear_context",
  };
  if (!isHeadwearDinoContext(context) || clusters.length < 2) return { clusters, debug };

  const top = clusters[0];
  const topPct = Number(top?.pct || 0);
  const topIsMutedSkinLike = isMutedSkinLikeHeadwearCluster(top);
  const candidate = clusters
    .slice(1)
    .map((cluster) => ({ cluster, score: getHeadwearColorBiasScore(cluster) }))
    .filter((row) => row.score > 0 && Number(row.cluster?.pct || 0) >= Math.max(0.06, topPct * (topIsMutedSkinLike ? 0.22 : 0.34)))
    .sort((a, b) => b.score - a.score)[0]?.cluster;

  if (!candidate) return { clusters, debug };
  const candidateHex = safeHex(candidate?.base || candidate?.hex || "");
  if (!candidateHex || candidateHex === preBiasTopHex) return { clusters, debug };

  const biasedClusters = [candidate, ...clusters.filter((cluster) => cluster !== candidate)];
  return {
    clusters: biasedClusters,
    debug: {
      headwear_color_bias_applied: true,
      pre_bias_top_hex: preBiasTopHex || null,
      post_bias_top_hex: candidateHex,
      reason: topIsMutedSkinLike
        ? "promoted_saturated_headwear_cluster_over_muted_skin_like_top"
        : "promoted_meaningful_saturated_headwear_cluster",
    },
  };
}

function getDinoZoneColorWeight(sample, zone = "") {
  const zoneKey = normalizeText(zone);
  const { hue, saturation, lightness } = sample;
  let weight = 1;
  const greenOrBrown = (hue >= 65 && hue <= 165 && saturation >= 0.18 && lightness <= 0.55) || (hue >= 18 && hue <= 58 && saturation >= 0.22 && lightness <= 0.58);
  const warmNeutral = hue >= 24 && hue <= 62 && saturation >= 0.10 && saturation <= 0.48 && lightness >= 0.38 && lightness <= 0.78;

  if (["accessory_jewelry", "lower_garment", "hat"].includes(zoneKey) && greenOrBrown) weight *= zoneKey === "lower_garment" ? 1.6 : 1.35;
  if (zoneKey === "upper_garment" && warmNeutral) weight *= 1.35;
  if (["bag", "footwear"].includes(zoneKey) && hue >= 15 && hue <= 55 && saturation >= 0.20 && lightness <= 0.62) weight *= 1.25;
  if (sample.bg) weight *= 0.35;
  if (sample.skin) weight *= 0.2;
  return weight;
}

function extractDinoBboxRegionColors(baseImage, bbox, limit = 6, context = {}) {
  const baseW = Number(baseImage?.width || 0);
  const baseH = Number(baseImage?.height || 0);
  const data = baseImage?.data;
  const pixelBbox = getPixelBboxFromDinoBbox(bbox, baseW, baseH);
  if (!data || !pixelBbox) return { colors: [], debug: null };

  const zone = context?.zone || "";
  const zoneKey = normalizeText(zone);
  const previousSampleBbox = zoneKey === "lower_garment"
    ? buildRelativePixelBbox(pixelBbox, 0.24, 0.76, 0.28, 0.86, "previous-center-crop")
    : getDinoSamplePixelBbox(pixelBbox, zone, context?.category || context?.label || "");
  const sampleBboxes = getDinoSamplePixelBboxes(pixelBbox, zone, context?.category || context?.label || "");
  const samples = [];
  const lowerWindowStats = [];
  let backgroundLike = 0;

  for (const sampleBbox of sampleBboxes) {
    const stride = Math.max(1, Math.floor(Math.sqrt((sampleBbox.width * sampleBbox.height) / 3000)));
    const windowSamples = [];
    for (let y = sampleBbox.y1; y < sampleBbox.y2; y += stride) {
      for (let x = sampleBbox.x1; x < sampleBbox.x2; x += stride) {
        const idx = (y * baseW + x) * 4;
        const alpha = Number(data[idx + 3] ?? 255);
        if (alpha < 20) continue;
        const r = Number(data[idx] || 0);
        const g = Number(data[idx + 1] || 0);
        const b = Number(data[idx + 2] || 0);
        const traits = getRgbTraits(r, g, b);
        const bg = isNearWhiteOrBlackPixel(r, g, b);
        const skin = isSkinLikePixel(r, g, b);
        if (bg) backgroundLike += 1;
        const sample = { r, g, b, bg, skin, ...traits };
        samples.push(sample);
        windowSamples.push(sample);
      }
    }
    if (zoneKey === "lower_garment") {
      const usableWindow = windowSamples.filter((sample) => !sample.bg && !sample.skin);
      const greenCount = usableWindow.filter((sample) =>
        sample.hue >= 65 && sample.hue <= 165 && sample.saturation >= 0.18 && sample.lightness <= 0.55
      ).length;
      lowerWindowStats.push({
        label: sampleBbox.label || null,
        sample_count: usableWindow.length,
        green_share: usableWindow.length ? round2(greenCount / usableWindow.length) : 0,
      });
    }
  }
  const greenWindowSupport = lowerWindowStats.filter((row) => row.sample_count >= 8 && row.green_share >= 0.12).length;

  if (!samples.length) {
    return {
      colors: [],
      debug: {
        color_sample_bbox: sampleBboxes[0],
        color_sample_bboxes: sampleBboxes,
        sample_windows_before: zoneKey === "lower_garment" ? [previousSampleBbox] : null,
        sample_windows_after: zoneKey === "lower_garment" ? sampleBboxes : null,
        previous_color_sample_bbox: zoneKey === "lower_garment" ? previousSampleBbox : null,
        sample_count: 0,
        filtered_sample_count: 0,
        dominant_hex_before_cluster: null,
        expected_dominant_color: null,
      },
    };
  }
  const nonBgSamples = samples.filter((sample) => !sample.bg);
  const nonSkinSamples = samples.filter((sample) => !sample.skin);
  let usableSamples = nonBgSamples.length >= Math.max(20, samples.length * 0.08) ? nonBgSamples : samples;
  const nonSkinUsable = usableSamples.filter((sample) => !sample.skin);
  if (!["skin", "face", "body"].includes(normalizeText(zone)) && nonSkinUsable.length >= Math.max(20, usableSamples.length * 0.12)) {
    usableSamples = nonSkinUsable;
  } else if (nonSkinSamples.length >= Math.max(20, samples.length * 0.12)) {
    usableSamples = nonSkinSamples;
  }

  const buckets = new Map();

  for (const sample of usableSamples) {
    const key = `${Math.round(sample.r / 16)}_${Math.round(sample.g / 16)}_${Math.round(sample.b / 16)}`;
    if (!buckets.has(key)) buckets.set(key, { count: 0, weight: 0, rSum: 0, gSum: 0, bSum: 0 });
    const row = buckets.get(key);
    const weight = getDinoZoneColorWeight(sample, zone);
    row.count += 1;
    row.weight += weight;
    row.rSum += sample.r * weight;
    row.gSum += sample.g * weight;
    row.bSum += sample.b * weight;
  }

  const totalWeight = Array.from(buckets.values()).reduce((sum, row) => sum + row.weight, 0) || usableSamples.length;
  const colorRows = Array.from(buckets.values())
    .map((row) => ({
      hex: safeHex(chroma(Math.round(row.rSum / Math.max(row.weight, 0.0001)), Math.round(row.gSum / Math.max(row.weight, 0.0001)), Math.round(row.bSum / Math.max(row.weight, 0.0001))).hex()),
      pct: row.weight / totalWeight,
      count: row.count,
    }))
    .filter((row) => !!row.hex)
    .sort((a, b) => b.pct - a.pct);

  const rankedColorRows = zoneKey === "lower_garment" ? sortLowerGarmentColors(colorRows, { greenWindowSupport }) : colorRows;
  const clusters = buildColorClusters(rankedColorRows);
  const rankedClustersBeforeHeadwearBias = zoneKey === "lower_garment" ? sortLowerGarmentColors(clusters.map((cluster) => ({ ...cluster, hex: cluster.base })), { greenWindowSupport }) : clusters;
  const { clusters: rankedClusters, debug: headwearColorBiasDebug } = applyHeadwearDinoColorBias(rankedClustersBeforeHeadwearBias, context);
  const colors = rankedClusters.slice(0, limit).map((cluster) => ({
    hex: safeHex(cluster.base),
    pct: round2(cluster.pct),
    name: getColorName(cluster.base),
  })).filter((color) => !!color.hex);
  return {
    colors,
    debug: {
      color_sample_bbox: sampleBboxes[0],
      color_sample_bboxes: sampleBboxes,
      sample_windows_before: zoneKey === "lower_garment" ? [previousSampleBbox] : null,
      sample_windows_after: zoneKey === "lower_garment" ? sampleBboxes : null,
      previous_color_sample_bbox: zoneKey === "lower_garment" ? previousSampleBbox : null,
      lower_window_stats: zoneKey === "lower_garment" ? lowerWindowStats : null,
      green_window_support: zoneKey === "lower_garment" ? greenWindowSupport : 0,
      sample_count: samples.length,
      filtered_sample_count: usableSamples.length,
      dominant_hex_before_cluster: colorRows[0]?.hex || null,
      expected_dominant_color: zoneKey === "lower_garment" ? (colors[0]?.hex || null) : null,
      ...headwearColorBiasDebug,
    },
  };
}

function chooseDinoBboxDominantHex(region = {}, sampledRegionColors = []) {
  const existingDominantHex = safeHex(region?.dominant_hex || "");
  const existingTopColor = Array.isArray(region?.region_colors) ? region.region_colors[0] : null;
  const existingTopPct = Number(existingTopColor?.pct || 0);
  const sampledTopColor = Array.isArray(sampledRegionColors) ? sampledRegionColors[0] : null;
  const sampledTopHex = safeHex(sampledTopColor?.hex || "");
  const sampledTopPct = Number(sampledTopColor?.pct || 0);

  let dominantHex = sampledTopHex || existingDominantHex || null;
  let preservedExisting = false;
  let reason = sampledTopHex ? "sampled_top_default" : "existing_only_or_no_sample";

  if (existingDominantHex && existingTopPct >= 0.75) {
    dominantHex = existingDominantHex;
    preservedExisting = true;
    reason = "existing_top_pct_strong_ge_0_75";
  } else if (!existingDominantHex) {
    dominantHex = sampledTopHex || null;
    reason = "existing_dominant_missing";
  } else if (existingTopPct < 0.55) {
    dominantHex = sampledTopHex || existingDominantHex;
    preservedExisting = !sampledTopHex;
    reason = sampledTopHex ? "existing_top_pct_weak_lt_0_55" : "existing_top_pct_weak_but_sample_missing";
  } else if (sampledTopHex && sampledTopPct >= existingTopPct + 0.10) {
    dominantHex = sampledTopHex;
    reason = "sampled_top_pct_clearly_stronger_than_existing_by_0_10";
  } else {
    dominantHex = existingDominantHex;
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

  return Promise.all(
    regions.map(async (region) => {
      if (!region?.mask_url) return region;

      try {
        const maskBuffer = await fetchImageBuffer(region.mask_url);
        const maskImage = decodeImageRgba(maskBuffer, region.mask_url);
        const regionColors = extractMaskedRegionColors(baseImage, maskImage, 6);
        const maskGeometry = extractMaskGeometry(maskImage);
        const dominantHex = safeHex(regionColors[0]?.hex || region?.dominant_hex || "");

        return {
          ...region,
          coverage: round2(Math.max(Number(region?.coverage || 0), Number(maskGeometry?.coverage || 0))),
          dominant_hex: dominantHex || region?.dominant_hex || null,
          region_colors: regionColors,
          mask_geometry: maskGeometry,
        };
      } catch {
        return region;
      }
    })
  );
}

async function runGroundingDinoDetection(imageUrl, query = DEFAULT_GROUNDING_DINO_QUERY) {
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
      });
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

    const startedAt = Date.now();
    let prediction = createResp;

    while (Date.now() - startedAt < REPLICATE_SAM_TIMEOUT_MS) {
      if (["succeeded", "failed", "canceled"].includes(prediction?.status)) break;
      await new Promise((resolve) => setTimeout(resolve, REPLICATE_SAM_POLL_MS));
      let retryAttempt = 0;
      let pollError = null;
      while (retryAttempt < REPLICATE_SAM_POLL_RETRY_MAX) {
        try {
          prediction = await replicateRequest(statusUrl, {
            method: "GET",
            headers: { Authorization: `Bearer ${token}` },
          });
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
        elapsedMs: Date.now() - startedAt,
      });
      return { enabled: true, ok: false, reason: prediction?.error || prediction?.status || "unknown_failure", detections: [] };
    }

    console.info("[GDINO DEBUG] RAW Grounding DINO OUTPUT", {
      outputPreview: JSON.stringify(prediction?.output)?.slice(0, 1000),
    });
    const detections = parseGroundingDinoOutputToDetections(prediction?.output);
    console.info("[GDINO DEBUG] Grounding DINO detection succeeded", {
      detectionCount: detections.length,
      predictionId: prediction?.id || null,
      elapsedMs: Date.now() - startedAt,
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

async function runSamSegmentation(imageUrl) {
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
      });
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

    const startedAt = Date.now();
    let prediction = createResp;

    while (Date.now() - startedAt < REPLICATE_SAM_TIMEOUT_MS) {
      if (["succeeded", "failed", "canceled"].includes(prediction?.status)) break;
      await new Promise((resolve) => setTimeout(resolve, REPLICATE_SAM_POLL_MS));
      let retryAttempt = 0;
      let pollError = null;
      while (retryAttempt < REPLICATE_SAM_POLL_RETRY_MAX) {
        try {
          prediction = await replicateRequest(statusUrl, {
            method: "GET",
            headers: { Authorization: `Bearer ${token}` },
          });
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
        elapsedMs: Date.now() - startedAt,
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
      elapsedMs: Date.now() - startedAt,
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

async function callPixelcutRemoveBg(imageUrl) {
  const apiKey = process.env.PIXELCUT_API_KEY;
  const endpoint = process.env.PIXELCUT_ENDPOINT;

  if (!apiKey || !endpoint) {
    throw new Error("Missing Pixelcut env vars (PIXELCUT_API_KEY / PIXELCUT_ENDPOINT)");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PIXELCUT_TIMEOUT_MS);

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

async function analyzeGhostColors(ghostUrl) {
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
  const groundingPasses = configuredSingleQuery
    ? [await runGroundingDinoDetection(ghostUrl, configuredSingleQuery)]
    : await Promise.all([
      runGroundingDinoDetection(ghostUrl, DEFAULT_GROUNDING_DINO_GARMENT_QUERY),
      runGroundingDinoDetection(ghostUrl, DEFAULT_GROUNDING_DINO_ACCESSORY_QUERY),
    ]);
  const dinoDetections = groundingPasses.flatMap((pass) => Array.isArray(pass?.detections) ? pass.detections : []);
  const groundingDino = {
    enabled: groundingPasses.some((pass) => pass?.enabled),
    ok: groundingPasses.some((pass) => pass?.ok),
    reason: groundingPasses.every((pass) => !pass?.ok)
      ? groundingPasses.map((pass) => pass?.reason).filter(Boolean).join("; ") || "all_grounding_dino_passes_failed"
      : null,
    detections: dinoDetections,
    pass_count: groundingPasses.length,
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

  const sam = await runSamSegmentation(ghostUrl);
  const samRegions = Array.isArray(sam?.regions) ? sam.regions : [];
  const samOk = !!sam?.ok && samRegions.length > 0;
  const dinoOk = !!groundingDino?.ok && dinoDetections.length > 0;
  const dinoGarmentOk = dinoGarmentRegions.length > 0;
  const detectionSegmentationOk = samOk || dinoGarmentOk;
  const garmentZoneSource = getGarmentZoneSource(samOk ? samRegions : [], dinoGarmentRegions);
  const segmentationProvider = samOk ? "sam" : null;
  const detectionProvider = dinoOk ? "grounding_dino" : null;

  return {
    dominantHex,
    dominantName: getColorName(dominantHex),
    topColors,
    decodedImage,
    segmentedRegions: samOk ? samRegions : dinoGarmentRegions,
    dinoGarmentRegions,
    dino_debug: dinoDebug,
    pipeline: {
      sam_enabled: !!sam?.enabled,
      sam_ok: samOk,
      sam_reason: sam?.reason || null,
      sam_version: process.env.REPLICATE_SAM_MODEL || DEFAULT_REPLICATE_SAM_MODEL,
      sam_throttled: isReplicateThrottleError(sam?.reason),
      dino_enabled: !!groundingDino?.enabled,
      dino_ok: dinoOk,
      dino_reason: groundingDino?.reason || null,
      dino_detection_count: dinoDetections.length,
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

    let ghostUrl;
    try {
      ghostUrl = await callPixelcutRemoveBg(publicUrl);
    } catch (error) {
      return sendStepError(res, 502, "pixelcut_remove_bg", error);
    }

    let analysis;
    try {
      analysis = await analyzeGhostColors(ghostUrl);
    } catch (error) {
      return sendStepError(res, 500, "analyze_cloudinary_colors", error);
    }
    const segmentedRegions = Array.isArray(analysis?.segmentedRegions) ? analysis.segmentedRegions : [];
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

    const effectiveExternalIntelligenceMode = captureQuality?.disposition === "retake"
      ? "off"
      : EXTERNAL_INTELLIGENCE_MODE;
    const externalSemantic = await runOpenAISemanticObserverV1({
      mode: effectiveExternalIntelligenceMode,
      imageUrl: publicUrl,
      visionCoreEvidence: buildExternalSemanticEvidence(outfitAnalysis),
      visionCoreDecision: buildExternalCompositeDecision(outfitAnalysis),
      model: OPENAI_SEMANTIC_MODEL,
      cache: externalSemanticCache,
      cacheKey: `${publicUrl}:visioncore_external_handoff_v1:${OPENAI_SEMANTIC_MODEL}`,
    });
    let semanticReconciliation = reconcileExternalSemanticsV1({
      handoff: externalSemantic?.handoff,
      outfitAnalysis,
    });
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
          lower_sampling_version: LOWER_SAMPLING_VERSION,
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
          disposition: externalSemantic?.handoff?.disposition || null,
          semantic_reconciliation: semanticReconciliation,
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


export { buildOutfitAnalysis, inferZoneColorRead, inferGarmentZones, MARKET_PERCEPTION_V6_MODE, extractDinoBboxRegionColors };
