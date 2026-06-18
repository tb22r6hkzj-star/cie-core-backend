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

/* =========================
   COLOR PROFILES
========================= */
function buildColorProfile(hex, pct = 0) {
  const safe = safeHex(hex);
  if (!safe) return null;

  const classification = classifyColorV2(safe);
  const lab = getLab(safe);
  const traits = getPerceptualTraits(safe);

  return {
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
  };
}

function isGarmentZoneKey(zoneKey) {
  return ["upper_garment", "lower_garment", "outerwear", "body_garment"].includes(zoneKey);
}

function compactColorRead(color) {
  const safe = safeHex(color?.hex || color?.base);
  if (!safe) return null;
  return {
    hex: safe,
    name: color?.name || getColorName(safe),
    pct: round2(color?.pct || 0),
  };
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
  if (!isGarmentZoneKey(zoneKey) || mode !== "multicolor") return {};

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

function buildRawDinoColorClusters(regionColors = []) {
  const clusters = [];

  for (const color of regionColors || []) {
    const hex = safeHex(color?.hex);
    if (!hex) continue;

    const pct = Number(color?.pct || 0);
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

  return {
    zone,
    hex: color.hex,
    name: color.name || getColorName(color.hex),
    pct: round2(color.pct || 0),
    score: Math.round(score || 0),
    structural_role: color.structural_role || "body",
    surface_role: classifySurfaceRole(color),
    family: color.family || classifyColorV2(color.hex).family,
    importance: color.importance || null,
  };
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

  return {
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
  };
}

function getBlackNuanceLabel(hex) {
  const light = getLight(hex);
  if (light < 0.12) return "Jet Black";
  if (light < 0.18) return "Deep Black";
  return "Graphite Black";
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
  };

  if (!zoneData?.hex) {
    debugContext.unknown_reason = "zone_data_missing_hex";
    return {
      mode: "single",
      cluster_count: 0,
      interpretation: "unknown",
      display_label: fallbackName,
      dominant_color: null,
      support_colors: [],
      accent_colors: [],
      confidence: 0,
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
      dominant_color: null,
      support_colors: [],
      accent_colors: [],
      confidence: 0,
      _debug: debugContext,
    };
  }

  const baseHex = safeHex(zoneData.hex) || zoneData.hex;
  const candidateColors = regionColors.length ? regionColors : useRegionOnly ? [] : normalizedColors;
  const zoneColors = candidateColors.filter((c) => {
    if (!c?.hex || !baseHex) return false;
    const dist = colorDistanceLab(c.hex, baseHex);
    if (dist < 14) return true;
    if (Number(c?.pct || 0) >= 0.18 && dist < 20) return true;
    return false;
  });

  const fallbackSet = useRegionOnly && !regionColors.length ? [zoneData] : zoneColors.length ? zoneColors : [zoneData];
  const clusters = buildColorClusters(fallbackSet);
  debugContext.filtered_cluster_count = clusters.length;
  const regionCoverage = clamp01(regionColors.reduce((sum, c) => sum + Number(c?.pct || 0), 0));
  const lowSignalRegion = useRegionOnly && regionCoverage < 0.3 && clusters.length < 2;
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
  const dominant = {
    base: preservedDinoHex || dominantCluster?.base || baseHex,
    pct: round2(
      preservedDinoCluster
        ? (Number(preservedDinoCluster?.weight || 0) || 1) / clustersTotalWeight
        : (Number(dominantCluster?.weight || 0) || 1) / clustersTotalWeight
    ),
  };
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
      dominant_color: null,
      support_colors: [],
      accent_colors: [],
      confidence: Math.round(clamp100(Number(zoneData?.score || 0) * 0.4)),
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
  const balancedTwoPlusSignal = topPct < 0.55 && secondPct >= 0.15;
  const multicolorReason = footwearMulticolorSignal
    ? "footwear_three_colors_pct_gte_0_06"
    : generalMulticolorSignal
      ? "three_colors_pct_gte_0_08"
      : balancedTwoPlusSignal
        ? "top_pct_lt_0_55_second_pct_gte_0_15"
        : null;
  const multicolorDetected = !!multicolorReason;
  debugContext.multicolor_detected = multicolorDetected;
  debugContext.multicolor_reason = multicolorReason;
  debugContext.meaningful_color_count = meaningfulClusters.length;
  const isDinoPreservedZone =
    context?.zoneColorSource === "dino_primary" ||
    !!safeHex(context?.preservedDinoHex || "") ||
    context?.preserveDinoZoneColor === true;
  const rawDinoClusters = isDinoPreservedZone ? buildRawDinoColorClusters(regionColors) : [];
  const rawDinoMeaningfulThreshold = zoneKey === "footwear" ? 0.06 : 0.08;
  const rawDinoMeaningfulClusters = rawDinoClusters.filter((c) => Number(c?.pct || 0) >= rawDinoMeaningfulThreshold);
  const rawDinoTopPct = Number(rawDinoClusters?.[0]?.pct || 0);
  const rawDinoSecondPct = Number(rawDinoClusters?.[1]?.pct || 0);
  const rawDinoMulticolorReason =
    isDinoPreservedZone &&
    (isGarmentZoneKey(zoneKey) || zoneKey === "footwear") &&
    rawDinoMeaningfulClusters.length >= 3
      ? zoneKey === "footwear"
        ? "raw_dino_three_colors_pct_gte_0_06"
        : "raw_dino_three_colors_pct_gte_0_08"
      : isDinoPreservedZone &&
          (isGarmentZoneKey(zoneKey) || zoneKey === "footwear") &&
          rawDinoTopPct < 0.55 &&
          rawDinoSecondPct >= 0.15
        ? "raw_dino_top_pct_lt_0_55_second_pct_gte_0_15"
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
    displayLabel = "Multicolor Sneaker";
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
  const useRawDinoMulticolorRead = mode === "multicolor" && rawDinoMulticolorDetected && rawDinoMeaningfulClusters.length;
  const colorReadClusters = useRawDinoMulticolorRead
    ? rawDinoMeaningfulClusters
    : mode === "multicolor" && meaningfulClusters.length
      ? meaningfulClusters
      : clusters;
  const dominantReadCluster = mode === "multicolor" && !useRawDinoMulticolorRead
    ? colorReadClusters[0] || { base: dominant.base, pct: dominant.pct }
    : { base: dominant.base, pct: dominant.pct };
  const dominantColor = {
    hex: dominantReadCluster.base,
    name: getColorName(dominantReadCluster.base),
    pct: round2(dominantReadCluster.pct),
  };
  const supportColors = colorReadClusters.slice(1, 3).map((c) => ({
    hex: c.base,
    name: getColorName(c.base),
    pct: round2(c.pct),
  }));
  const accentColors = colorReadClusters.slice(3, 5).map((c) => ({
    hex: c.base,
    name: getColorName(c.base),
    pct: round2(c.pct),
  }));
  const rawDinoPrimaryColor = useRawDinoMulticolorRead
    ? {
        hex: colorReadClusters[0].base,
        name: getColorName(colorReadClusters[0].base),
        pct: round2(colorReadClusters[0].pct),
      }
    : null;
  const rawDinoSecondaryColors = useRawDinoMulticolorRead
    ? colorReadClusters.slice(1, 3).map((c) => ({
        hex: c.base,
        name: getColorName(c.base),
        pct: round2(c.pct),
      }))
    : [];
  const rawDinoAccentColors = useRawDinoMulticolorRead
    ? colorReadClusters.slice(3, 5).map((c) => ({
        hex: c.base,
        name: getColorName(c.base),
        pct: round2(c.pct),
      }))
    : [];

  return {
    mode,
    read_mode: mode,
    cluster_count: clusters.length,
    interpretation,
    display_label: displayLabel,
    confidence: zoneConfidence,
    dominant_color: dominantColor,
    support_colors: supportColors,
    accent_colors: accentColors,
    ...(
      useRawDinoMulticolorRead && isGarmentZoneKey(zoneKey)
        ? {
            primary_color: compactColorRead(rawDinoPrimaryColor),
            secondary_colors: rawDinoSecondaryColors.map(compactColorRead).filter(Boolean),
            accent_colors: rawDinoAccentColors.map(compactColorRead).filter(Boolean),
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
    _debug: debugContext,
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
  const hasLensLikeContrast = zoneRegions.some((r) => {
    const colors = Array.isArray(r?.region_colors) ? r.region_colors : [];
    if (colors.length < 2) return false;
    const sorted = colors
      .map((c) => ({ ...c, hex: safeHex(c?.hex) }))
      .filter((c) => !!c.hex)
      .sort((a, b) => Number(b?.pct || 0) - Number(a?.pct || 0));
    if (sorted.length < 2) return false;
    const top = sorted[0];
    const second = sorted[1];
    const lightDiff = Math.abs(getLight(top.hex) - getLight(second.hex));
    const darkLens = getLight(top.hex) < 0.34 || getLight(second.hex) < 0.34;
    const reflectiveEdge = getLight(top.hex) > 0.64 || getLight(second.hex) > 0.64;
    return lightDiff >= 0.2 && darkLens && reflectiveEdge;
  });
  return compactRegion && hasLensLikeContrast && coverage >= 0.05 && weightedConfidence >= 38;
}

function hasStrongOuterwearRegionSignal(zoneRegions = [], evidence = {}) {
  if (!Array.isArray(zoneRegions) || !zoneRegions.length) return false;
  const coverage = Number(evidence?.coverage || 0);
  const weightedConfidence = Number(evidence?.weighted_confidence || 0);
  const colorCount = Number(evidence?.color_count || 0);
  const largeRegion = zoneRegions.some((r) => Number(r?.coverage || 0) >= 0.22);
  const materialContrast = zoneRegions.some((r) => {
    const colors = Array.isArray(r?.region_colors) ? r.region_colors : [];
    if (colors.length < 2) return false;
    const sorted = colors
      .map((c) => ({ ...c, hex: safeHex(c?.hex) }))
      .filter((c) => !!c.hex)
      .sort((a, b) => Number(b?.pct || 0) - Number(a?.pct || 0));
    if (sorted.length < 2) return false;
    const top = sorted[0];
    const second = sorted[1];
    const lightDiff = Math.abs(getLight(top.hex) - getLight(second.hex));
    const satDiff = Math.abs(getSat(top.hex) - getSat(second.hex));
    return lightDiff >= 0.16 || satDiff >= 0.22;
  });
  return largeRegion && materialContrast && coverage >= 0.2 && weightedConfidence >= 40 && colorCount >= 2;
}

function hasExplicitZoneRegionEvidence(zoneKey, zoneRegions = [], evidence = {}) {
  const regionCount = Number(evidence?.region_count || 0);
  const coverage = Number(evidence?.coverage || 0);
  const weightedConfidence = Number(evidence?.weighted_confidence || 0);
  const colorCount = Number(evidence?.color_count || 0);
  const labels = (zoneRegions || []).map((r) => normalizeText(r?.segment_label || r?.label || r?.zone || ""));
  const hasDinoEvidence = (zoneRegions || []).some((r) =>
    r?.source_type === "dino_detection" || r?.source_type === "grounding_dino"
  );

  if (hasDinoEvidence) {
    return regionCount >= 1 && weightedConfidence >= 35;
  }

  if (["bag", "accessory_jewelry", "footwear", "fur_trim"].includes(zoneKey)) {
    return regionCount >= 1 && coverage >= 0.12 && weightedConfidence >= 40 && colorCount >= 1;
  }

  if (zoneKey === "logo_text_detail") {
    const hasTextLikeLabel = labels.some((t) => /logo|text|graphic|print/.test(t));
    const hasContrastSignal = (zoneRegions || []).some((r) =>
      hasHighContrastColorSignal(Array.isArray(r?.region_colors) ? r.region_colors : [])
    );
    return (
      regionCount >= 1 &&
      coverage >= 0.08 &&
      weightedConfidence >= 42 &&
      colorCount >= 1 &&
      (hasTextLikeLabel || hasContrastSignal)
    );
  }

  if (zoneKey === "outerwear") {
    if (hasStrongOuterwearRegionSignal(zoneRegions, evidence)) return true;
    return regionCount >= 1 && coverage >= 0.16 && weightedConfidence >= 42 && colorCount >= 1;
  }

  if (zoneKey === "eyewear") {
    if (hasStrongEyewearRegionSignal(zoneRegions, evidence)) return true;
    return regionCount >= 1 && coverage >= 0.08 && weightedConfidence >= 40 && colorCount >= 1;
  }

  return regionCount >= 1;
}

function shouldPromoteFallbackZone(zoneKey, evidence, zoneScore = 0) {
  if (["bag", "accessory_jewelry", "footwear", "logo_text_detail", "fur_trim", "outerwear"].includes(zoneKey)) {
    return false;
  }
  if (!["lower_garment"].includes(zoneKey)) return true;
  const hasStrongRegionEvidence =
    Number(evidence?.region_count || 0) >= 1 &&
    Number(evidence?.coverage || 0) >= 0.24 &&
    Number(evidence?.weighted_confidence || 0) >= 42;
  const hasStrongColorEvidence = Number(evidence?.color_count || 0) >= 2;
  const passesConfidence = Number(zoneScore || 0) >= 58;
  return (hasStrongRegionEvidence && hasStrongColorEvidence) || passesConfidence;
}

function areLikelyOnePiece(zones = {}, segmentedByZone = {}) {
  const upper = getZoneRegionEvidence(segmentedByZone.upper_garment || []);
  const lower = getZoneRegionEvidence(segmentedByZone.lower_garment || []);
  const bodyEvidence = upper.region_count + lower.region_count;
  if (bodyEvidence < 1) return { decision: false, confidence: 0, reason: "insufficient_region_evidence" };

  const upperHex = zones?.upper_garment?.hex;
  const lowerHex = zones?.lower_garment?.hex;
  const hasColors = !!upperHex && !!lowerHex;
  const labDistance = hasColors ? colorDistanceLab(upperHex, lowerHex) : 99;
  const upperScore = Number(zones?.upper_garment?.confidence || zones?.upper_garment?.score || 0);
  const lowerScore = Number(zones?.lower_garment?.confidence || zones?.lower_garment?.score || 0);
  const noStrongSplitEvidence = lower.coverage < 0.28 || lowerScore < 55;
  const visuallyContinuous = hasColors && labDistance < 11;
  const decision = visuallyContinuous && noStrongSplitEvidence;
  const confidence = decision ? Math.round(clamp100(62 + (11 - Math.max(0, labDistance)) * 2.2)) : 0;
  return {
    decision,
    confidence,
    reason: decision ? "continuous_body_region_and_weak_split" : "split_evidence_present",
    lab_distance: round2(labDistance),
    upper_score: upperScore,
    lower_score: lowerScore,
  };
}

function dedupeDarkNeutralZoneReuse(zones = {}) {
  const slots = ["upper_garment", "lower_garment", "outerwear"];
  const candidates = slots
    .map((slot) => ({ slot, data: zones[slot] }))
    .filter((x) => !!x?.data?.hex)
    .map((x) => ({
      ...x,
      confidence: Number(x.data?.confidence || x.data?.score || 0),
      traits: getPerceptualTraits(x.data.hex),
    }));

  const removals = [];
  for (let i = 0; i < candidates.length; i += 1) {
    for (let j = i + 1; j < candidates.length; j += 1) {
      const a = candidates[i];
      const b = candidates[j];
      const dist = colorDistanceLab(a.data.hex, b.data.hex);
      const nearDuplicate = dist < 9;
      const darkNeutralPair =
        a.traits?.chroma_magnitude < 20 &&
        b.traits?.chroma_magnitude < 20 &&
        getLight(a.data.hex) < 0.45 &&
        getLight(b.data.hex) < 0.45;

      if (nearDuplicate || darkNeutralPair) {
        const weaker = a.confidence <= b.confidence ? a : b;
        if (weaker.slot === "upper_garment") continue;
        removals.push({
          slot: weaker.slot,
          reason: "near_duplicate_dark_neutral",
          matched_with: weaker.slot === a.slot ? b.slot : a.slot,
          distance: round2(dist),
        });
      }
    }
  }

  const deduped = { ...zones };
  for (const r of removals) {
    const current = deduped[r.slot];
    if (!current?.hex) continue;
    deduped[r.slot] = {
      ...current,
      hex: null,
      interpretation: "unknown",
      display_label: titleCase(String(r.slot).replace(/_/g, " ")),
      confidence: Math.min(Number(current?.confidence || 0), 42),
      dominant_color: null,
      support_colors: [],
      accent_colors: [],
      dedupe_reason: r.reason,
    };
  }

  return { zones: deduped, removals };
}

const GARMENT_ZONE_OUTPUT_WHITELIST = new Set([
  "upper",
  "upper_garment",
  "lower",
  "lower_garment",
  "body_garment",
  "one_piece",
  "outerwear",
  "footwear",
  "bag",
  "accessory",
  "accessories",
  "accessory_jewelry",
  "eyewear",
  "logo_text_detail",
  "fur_trim",
]);

function filterGarmentZoneOutput(zones = {}) {
  const filteredZones = {};
  const removedNonGarmentZones = [];

  for (const [zoneKey, zoneData] of Object.entries(zones || {})) {
    if (GARMENT_ZONE_OUTPUT_WHITELIST.has(zoneKey)) {
      filteredZones[zoneKey] = zoneData;
      continue;
    }
    removedNonGarmentZones.push(zoneKey);
  }

  return {
    zones: filteredZones,
    removed_non_garment_zones: removedNonGarmentZones,
  };
}

function inferGarmentZones(normalizedColors = [], colorRoles = [], visualIntelligence = {}, segmentedRegions = []) {
  const roleByName = Object.fromEntries((colorRoles || []).map((r) => [r.role, r]));
  const dominant = visualIntelligence?.dominant_body_color || roleByName.anchor || normalizedColors[0] || null;
  const secondary = roleByName.support || normalizedColors[1] || dominant;
  const accent = roleByName.accent || normalizedColors[2] || secondary;
  const stabilizer = roleByName.stabilizer || normalizedColors[3] || secondary;

  const segmentedByZone = {};
  const genericSamRegions = [];
  for (const region of segmentedRegions || []) {
    const zone = region?.zone && region.zone !== "unknown" ? region.zone : getZoneFromLabel(region?.segment_label);
    if (zone === "unknown") {
      genericSamRegions.push(region);
      continue;
    }
    if (!segmentedByZone[zone]) segmentedByZone[zone] = [];
    segmentedByZone[zone].push(region);
  }

  const bodyContextBoxes = []
    .concat(segmentedByZone.upper_garment || [])
    .concat(segmentedByZone.lower_garment || [])
    .concat(segmentedByZone.body_garment || [])
    .map((r) => r?.mask_geometry?.bbox)
    .filter(Boolean);
  const outerContextBoxes = (segmentedByZone.outerwear || []).map((r) => r?.mask_geometry?.bbox).filter(Boolean);
  const genericContext = {
    body_bbox: mergeNormalizedBBoxes(bodyContextBoxes),
    outer_bbox: mergeNormalizedBBoxes(outerContextBoxes),
  };
  const genericMaskDebug = [];
  for (const region of genericSamRegions) {
    const proposal = estimateGenericMaskZone(region, genericContext);
    const dominantHex = safeHex(region?.dominant_hex || region?.region_colors?.[0]?.hex || "");
    const candidateDebug = {
      mask_id: region?.id || null,
      coverage: round2(Number(region?.mask_geometry?.coverage || region?.coverage || 0)),
      dominant_hex: dominantHex || null,
      region_colors: (Array.isArray(region?.region_colors) ? region.region_colors : [])
        .map((c) => ({ hex: safeHex(c?.hex) || c?.hex || null, pct: round2(Number(c?.pct || 0)) }))
        .filter((c) => !!c.hex)
        .slice(0, 4),
      estimated_positional_role: proposal.estimated_role,
      proposed_zone: proposal.proposed_zone,
      proposed_zone_flags: {
        upper_garment: proposal.proposed_zone === "upper_garment",
        body_garment: proposal.proposed_zone === "body_garment",
        outerwear: proposal.proposed_zone === "outerwear",
        eyewear: proposal.proposed_zone === "eyewear",
        fur_trim: proposal.proposed_zone === "fur_trim",
      },
      accepted: proposal.accepted,
      accepted_reasons: proposal.acceptance_reasons,
      rejected_reasons: proposal.rejection_reasons,
      top_score: proposal.top_score,
      threshold_used: proposal.threshold_used,
      expandsPastBody: proposal.expandsPastBody,
      nearOuterBoundary: proposal.nearOuterBoundary,
      body_bbox: proposal.body_bbox,
      bbox: proposal.bbox,
      final_acceptance_formula: proposal.decision_formula,
    };
    genericMaskDebug.push(candidateDebug);
    console.info("[SAM DEBUG] Generic mask candidate", candidateDebug);

    if (proposal.accepted && proposal.proposed_zone) {
      if (!segmentedByZone[proposal.proposed_zone]) segmentedByZone[proposal.proposed_zone] = [];
      segmentedByZone[proposal.proposed_zone].push({
        ...region,
        zone: proposal.proposed_zone,
        generic_zone_proposal: proposal,
      });
    }
  }

  const zoneMap = {
    upper_garment: dominant,
    lower_garment: secondary,
    outerwear: stabilizer,
    footwear: accent,
    eyewear: stabilizer,
    bag: secondary,
    hair: dominant,
    lips: accent,
    fur_trim: stabilizer,
    logo_text_detail: accent,
    accessory_jewelry: accent,
  };

  const zones = {};
  const regionColorAnalysis = [];
  const regionSummary = [];
  const zoneCandidateSummary = [];
  const missedZoneDebug = [];

  for (const [zoneKey, fallbackColor] of Object.entries(zoneMap)) {
    const zoneRegions = segmentedByZone[zoneKey] || [];
    const regionColors = zoneRegions
      .flatMap((r) => {
        const local = Array.isArray(r?.region_colors) ? r.region_colors : [];
        if (local.length) return local;
        const fallbackHex = safeHex(r?.dominant_hex || r?.hex);
        if (!fallbackHex) return [];
        return [{ hex: fallbackHex, pct: Number(r?.coverage || r?.confidence || 0.2) }];
      })
      .filter((c) => !!c.hex);
    const evidence = getZoneRegionEvidence(zoneRegions);
    const isDinoSourceType = (sourceType) => sourceType === "grounding_dino" || sourceType === "dino_detection";
    const dinoOnlyZone =
      zoneRegions.length > 0 &&
      zoneRegions.every((region) => isDinoSourceType(region?.source_type));
    const dinoPrimaryRegion = dinoOnlyZone ? zoneRegions.find((region) => isDinoSourceType(region?.source_type)) : null;
    const dinoPrimaryHex = dinoOnlyZone
      ? safeHex(dinoPrimaryRegion?.dominant_hex || dinoPrimaryRegion?.region_colors?.[0]?.hex || "")
      : null;
    const preserveDinoZoneColor =
      ["accessory_jewelry", "bag", "footwear", "lower_garment", "upper_garment"].includes(zoneKey) &&
      dinoOnlyZone &&
      !!dinoPrimaryHex;

    const hasColorRegionEvidence = zoneRegions.some((region) => {
      const sourceType = region?.source_type;
      const isDinoRegion = sourceType === "grounding_dino" || sourceType === "dino_detection";
      const explicitRegionColors = Array.isArray(region?.region_colors) ? region.region_colors : [];
      return !isDinoRegion && explicitRegionColors.length > 0;
    });
    const regionClusters = buildColorClusters(regionColors);
    const consensusCluster = regionClusters[0] || null;
    const chosenColor = preserveDinoZoneColor
      ? { ...fallbackColor, hex: dinoPrimaryHex, pct: dinoPrimaryRegion?.region_colors?.[0]?.pct || dinoPrimaryRegion?.coverage || dinoPrimaryRegion?.confidence || consensusCluster?.pct || fallbackColor?.pct }
      : consensusCluster?.base
        ? { ...fallbackColor, hex: consensusCluster.base, pct: consensusCluster.pct }
        : fallbackColor;
    const computedScore = Math.max(45, Math.round((chosenColor?.pct || 0.25) * 100));
    const promoteFallback = shouldPromoteFallbackZone(zoneKey, evidence, computedScore);
    const hasExplicitEvidence = hasExplicitZoneRegionEvidence(zoneKey, zoneRegions, evidence);
    const strongEyewearSignal = zoneKey === "eyewear" ? hasStrongEyewearRegionSignal(zoneRegions, evidence) : false;
    const strongOuterwearSignal = zoneKey === "outerwear" ? hasStrongOuterwearRegionSignal(zoneRegions, evidence) : false;
    const strongSignalHelper = zoneKey === "eyewear" ? strongEyewearSignal : zoneKey === "outerwear" ? strongOuterwearSignal : false;
    const allowZoneFromRegionOnly = ["bag", "accessory_jewelry", "footwear", "logo_text_detail", "fur_trim", "outerwear"].includes(zoneKey);
    const useRegionCandidate = hasExplicitEvidence && zoneRegions.length > 0;
    const zoneData = useRegionCandidate
      ? buildZoneCandidate(chosenColor, zoneKey, computedScore)
      : promoteFallback && !allowZoneFromRegionOnly
        ? buildZoneCandidate(chosenColor, zoneKey, computedScore)
        : null;
    const dominantDarkBodyHex =
      zones.upper_garment?.dominant_color?.hex ||
      zones.upper_garment?.hex ||
      zones.body_garment?.dominant_color?.hex ||
      zones.body_garment?.hex ||
      null;
    const zoneRead = inferZoneColorRead(
      zoneKey,
      zoneData,
      normalizedColors,
      regionColors,
      hasColorRegionEvidence || preserveDinoZoneColor,
      {
        dominantDarkBodyHex,
        preservedDinoHex: preserveDinoZoneColor ? dinoPrimaryHex : null,
        preserveDinoZoneColor,
        zoneColorSource: preserveDinoZoneColor ? "dino_primary" : consensusCluster?.base ? "cluster" : "fallback",
      }
    );
    if (["eyewear", "outerwear", "fur_trim"].includes(zoneKey)) {
      const segmentLabels = zoneRegions.map((r) => r?.segment_label || r?.label || r?.zone || "unknown");
      const regionColorSummary = zoneRegions.map((r) => ({
        segment_label: r?.segment_label || r?.label || r?.zone || "unknown",
        coverage: round2(Number(r?.coverage || 0)),
        confidence: round2(Number(r?.confidence || 0)),
        region_colors: (Array.isArray(r?.region_colors) ? r.region_colors : [])
          .map((c) => ({
            hex: safeHex(c?.hex) || c?.hex || null,
            pct: round2(Number(c?.pct || 0)),
            name: c?.name || null,
          }))
          .filter((c) => !!c.hex),
      }));
      missedZoneDebug.push({
        zone: zoneKey,
        region_count: evidence.region_count,
        coverage: evidence.coverage,
        weighted_confidence: evidence.weighted_confidence,
        color_count: evidence.color_count,
        has_explicit_zone_region_evidence: hasExplicitEvidence,
        strong_signal_helper: strongSignalHelper,
        strong_signal_helper_name:
          zoneKey === "eyewear"
            ? "hasStrongEyewearRegionSignal"
            : zoneKey === "outerwear"
              ? "hasStrongOuterwearRegionSignal"
              : "none",
        zone_data_created: !!zoneData,
        zone_data_hex: zoneData?.hex || null,
        infer_zone_unknown: zoneRead?.interpretation === "unknown",
        infer_zone_unknown_reason: zoneRead?._debug?.unknown_reason || null,
        suppression_gates: zoneRead?._debug?.suppression_gates || null,
        infer_zone_strong_signal_overrides: zoneRead?._debug?.strong_signal_overrides || null,
        segment_labels: segmentLabels,
        region_colors_summary: regionColorSummary,
      });
    }
    regionSummary.push({
      zone: zoneKey,
      region_count: evidence.region_count,
      coverage: evidence.coverage,
      weighted_confidence: evidence.weighted_confidence,
      color_count: evidence.color_count,
    });
    zoneCandidateSummary.push({
      zone: zoneKey,
      has_sam_region: hasColorRegionEvidence,
      promote_fallback: promoteFallback,
      score: computedScore,
      selected_hex: zoneData?.hex || null,
      confidence: zoneRead?.confidence || 0,
      zone_color_source: zoneRead?._debug?.zone_color_source || null,
      preserved_dino_hex: zoneRead?._debug?.preserved_dino_hex || null,
    });

    zones[zoneKey] = {
      ...(zoneData || {}),
      ...zoneRead,
    };

    const dominantObj = buildSegmentedColorObject({
      color: { hex: zoneRead?.dominant_color?.hex, pct: zoneRead?.dominant_color?.pct },
      zone: zoneKey,
      role: "dominant",
      sourceType: hasColorRegionEvidence ? "sam_segment" : "global_palette",
      segmentLabel: zoneRegions[0]?.segment_label || zoneKey,
      confidence: zoneRead?.confidence || zoneData?.score || 0,
    });

    if (dominantObj) regionColorAnalysis.push(dominantObj);

    for (const support of zoneRead.support_colors || []) {
      const obj = buildSegmentedColorObject({
        color: support,
        zone: zoneKey,
        role: "support",
        sourceType: hasColorRegionEvidence ? "sam_segment" : "global_palette",
        segmentLabel: zoneRegions[0]?.segment_label || zoneKey,
        confidence: Math.max(40, (zoneRead?.confidence || 0) - 12),
      });
      if (obj) regionColorAnalysis.push(obj);
    }

    for (const accentColor of zoneRead.accent_colors || []) {
      const obj = buildSegmentedColorObject({
        color: accentColor,
        zone: zoneKey,
        role: "accent",
        sourceType: hasColorRegionEvidence ? "sam_segment" : "global_palette",
        segmentLabel: zoneRegions[0]?.segment_label || zoneKey,
        confidence: Math.max(35, (zoneRead?.confidence || 0) - 16),
      });
      if (obj) regionColorAnalysis.push(obj);
    }
  }

  const onePieceDecision = areLikelyOnePiece(zones, segmentedByZone);
  if (onePieceDecision.decision) {
    const baseBody = zones.upper_garment?.hex ? zones.upper_garment : zones.lower_garment;
    const bodyCandidate = baseBody
      ? buildZoneCandidate(
          { hex: baseBody.hex, pct: Math.max(baseBody?.pct || 0.35, 0.35), name: baseBody?.name },
          "body_garment",
          Math.max(60, onePieceDecision.confidence)
        )
      : null;
    const bodyRead = inferZoneColorRead("body_garment", bodyCandidate, normalizedColors, [], false);
    zones.body_garment = {
      ...bodyCandidate,
      ...bodyRead,
      silhouette: "one_piece",
      one_piece_confidence: onePieceDecision.confidence,
    };
    zones.one_piece = {
      zone: "one_piece",
      interpretation: "one_piece",
      confidence: onePieceDecision.confidence,
      evidence: onePieceDecision.reason,
      lab_distance: onePieceDecision.lab_distance,
    };

    if (zones.lower_garment) {
      zones.lower_garment = {
        ...zones.lower_garment,
        hex: null,
        interpretation: "unknown",
        confidence: Math.min(Number(zones.lower_garment?.confidence || 0), 45),
        dominant_color: null,
        support_colors: [],
        accent_colors: [],
        one_piece_suppressed: true,
      };
    }
  }

  const dedupeResult = dedupeDarkNeutralZoneReuse(zones);
  const garmentZoneFilterResult = filterGarmentZoneOutput(dedupeResult.zones);
  const finalZones = garmentZoneFilterResult.zones;
  const denimSummary = {
    lower_zone_interpretation: finalZones?.lower_garment?.interpretation || "unknown",
    lower_zone_confidence: Number(finalZones?.lower_garment?.confidence || 0),
    lower_zone_hex: finalZones?.lower_garment?.hex || null,
  };

  console.info("[INTERPRET DEBUG] segmented region summary", regionSummary);
  console.info("[INTERPRET DEBUG] zone candidate summary", zoneCandidateSummary);
  if (missedZoneDebug.length) {
    console.info("[INTERPRET DEBUG] missed zone suppression diagnostics", missedZoneDebug);
  }
  if (genericMaskDebug.length) {
    console.info("[INTERPRET DEBUG] generic mask proposal diagnostics", genericMaskDebug);
  }
  console.info("[INTERPRET DEBUG] one_piece decision summary", onePieceDecision);
  console.info("[INTERPRET DEBUG] denim decision summary", denimSummary);
  if (garmentZoneFilterResult.removed_non_garment_zones.length) {
    console.info("[INTERPRET DEBUG] removed non-garment zones", garmentZoneFilterResult.removed_non_garment_zones);
  }
  console.info(
    "[INTERPRET DEBUG] final selected zones with confidence",
    Object.fromEntries(Object.entries(finalZones).map(([k, v]) => [k, Number(v?.confidence || v?.score || 0)]))
  );

  return {
    version: "garment_zone_v3",
    segmented_regions: segmentedRegions,
    zones: finalZones,
    region_color_analysis: regionColorAnalysis,
    generic_mask_debug: genericMaskDebug,
    removed_non_garment_zones: garmentZoneFilterResult.removed_non_garment_zones,
  };
}

function buildColorClusters(colors = []) {

  const clusters = [];

  for (const c of colors || []) {
    const hex = safeHex(c?.hex);
    if (!hex) continue;

    let placed = false;

    for (const cluster of clusters) {
      const dist = colorDistanceLab(hex, cluster.base);
      if (dist < 20) {
        cluster.colors.push(c);
        cluster.weight += Number(c?.pct || 1);
        placed = true;
        break;
      }
    }

    if (!placed) {
      clusters.push({
        base: hex,
        colors: [c],
        weight: Number(c?.pct || 1),
      });
    }
  }

  const total = clusters.reduce((sum, c) => sum + Number(c.weight || 0), 0) || 1;

  return clusters
    .map((c) => ({
      ...c,
      pct: c.weight / total,
    }))
    .sort((a, b) => b.pct - a.pct);
}

function isMultiColor(clusters = []) {
  if (clusters.length < 3) return false;
  const topPct = Number(clusters?.[0]?.pct || 0);
  return topPct < 0.55;
}

function isDenimLike(clusters = []) {
  const blueClusters = clusters.filter((c) => {
    const h = getHue(c.base);
    return h >= 200 && h <= 250;
  });

  const supportiveBlueClusters = clusters.filter((c) => {
    const h = getHue(c.base);
    return h >= 190 && h <= 260 && Number(c?.pct || 0) >= 0.12;
  });
  const blueCoverage = blueClusters.reduce((sum, c) => sum + Number(c?.pct || 0), 0);
  const meaningfulCoverage = clusters.reduce((sum, c) => sum + Number(c?.pct || 0), 0) >= 0.55;
  const lowChroma = clusters.every((c) => {
    const chromaMag = Number(getPerceptualTraits(c.base)?.chroma_magnitude || 0);
    const light = getLight(c.base);
    return chromaMag < 44 && light > 0.2;
  });

  const midLight = clusters.some((c) => {
    const l = getLight(c.base);
    return l >= 0.38 && l <= 0.82;
  });

  return blueClusters.length >= 2 && supportiveBlueClusters.length >= 2 && blueCoverage >= 0.45 && meaningfulCoverage && lowChroma && midLight;
}

function inferGarmentAndMaterial({ zones, normalizedColors = [] }) {
  const z = zones || {};
  const items = [];

  function getZoneColors(zoneHex) {
    if (!zoneHex) return [];
    return (normalizedColors || []).filter((c) => colorDistanceLab(c.hex, zoneHex) < 22);
  }

  function buildItem(type, zoneData) {
    if (!zoneData?.hex) return null;
    if (
      ["lower_garment", "footwear"].includes(type) &&
      Number(zoneData?.confidence || 0) < 56
    ) {
      return null;
    }
    if (
      type === "outerwear" &&
      Number(zoneData?.confidence || 0) < 52 &&
      Number(zoneData?.cluster_count || 0) < 2
    ) {
      return null;
    }

    const zoneColors = getZoneColors(zoneData.hex);
    const clusterInput = Array.isArray(zoneData?.support_colors) && zoneData.support_colors.length
      ? [{ hex: zoneData.hex, pct: zoneData.pct || 0.5 }, ...zoneData.support_colors]
      : zoneColors.length
        ? zoneColors
        : [zoneData];
    const clusters = buildColorClusters(clusterInput);
    const dominant = clusters[0] || { base: zoneData.hex, pct: 1 };

    const dominantTraits = getPerceptualTraits(dominant.base);

    let material = "mixed_material";
    let materialConfidence = 50;
    let displayLabel = zoneData.display_label || zoneData.name || getColorName(dominant.base);

    if (isDenimLike(clusters) && type === "lower_garment") {
      material = "denim";
      materialConfidence = 84;
      displayLabel = "Light Wash Denim";
    } else if (isMultiColor(clusters) && type === "footwear") {
      material = "mixed_material";
      materialConfidence = 76;
      displayLabel = "Multicolor Sneaker";
    } else if (isMultiColor(clusters) && type === "accessory") {
      material = "patterned_textile";
      materialConfidence = 74;
      displayLabel = "Multicolor Accessory";
    } else if (type === "fur_trim") {
      material = "fur";
      materialConfidence = 68;
    } else if (type === "logo_text_detail" && dominantTraits.chroma_magnitude < 24) {
      material = "cotton";
      materialConfidence = 58;
    } else if (type === "eyewear" && getLight(dominant.base) < 0.32) {
      material = "nylon";
      materialConfidence = 62;
    } else if (type === "accessory_jewelry" && dominantTraits.chroma_magnitude < 20 && getLight(dominant.base) > 0.45) {
      material = "metallic";
      materialConfidence = 64;
    } else if (dominantTraits.temperature === "cool" && dominantTraits.chroma_magnitude < 30) {
      material = "wool";
      materialConfidence = 60;
    } else if (dominantTraits.chroma_magnitude > 48) {
      material = "knit";
      materialConfidence = 58;
    } else if (type === "outerwear") {
      material = getLight(dominant.base) < 0.4 ? "leather" : "cotton";
      materialConfidence = 61;
    }

    if (type === "footwear" && getLight(dominant.base) < 0.35) {
      material = material === "mixed_material" ? "rubber" : "leather";
      materialConfidence = Math.max(materialConfidence, 66);
    }

    if (type === "footwear") {
      const tanLike = clusters.some((c) => {
        const h = getHue(c.base);
        const l = getLight(c.base);
        const s = getSat(c.base);
        return h >= 25 && h <= 55 && l >= 0.34 && l <= 0.72 && s >= 0.2;
      });
      const tanCoverage = clusters
        .filter((c) => {
          const h = getHue(c.base);
          return h >= 25 && h <= 55;
        })
        .reduce((sum, c) => sum + Number(c?.pct || 0), 0);
      if (/tan|camel|beige|luxury/i.test(displayLabel) && (!tanLike || tanCoverage < 0.42)) {
        displayLabel = getColorName(dominant.base);
      }
      if (Number(zoneData?.confidence || 0) < 58 && clusters.length < 2) {
        return null;
      }
    }

    const dominantColor = {
      hex: dominant.base,
      name: getColorName(dominant.base),
      pct: round2(dominant.pct),
    };
    const supportColors = clusters.slice(1, 3).map((c) => ({
      hex: c.base,
      name: getColorName(c.base),
      pct: round2(c.pct),
    }));
    const accentColors = clusters.slice(3, 5).map((c) => ({
      hex: c.base,
      name: getColorName(c.base),
      pct: round2(c.pct),
    }));
    const itemMode = zoneData.mode || zoneData.read_mode || (isMultiColor(clusters) ? "multicolor" : "single_color");

    return {
      type,
      confidence: zoneData.score || 60,
      material,
      material_confidence: materialConfidence,
      cluster_count: clusters.length,
      display_label: displayLabel,
      dominant_color: dominantColor,
      support_colors: supportColors,
      accent_colors: accentColors,
      ...buildGarmentColorProfile({
        zoneKey: type,
        mode: itemMode,
        dominantColor,
        supportColors,
        accentColors,
      }),
    };
  }

  items.push(buildItem("upper_garment", z.upper_garment));
  items.push(buildItem("lower_garment", z.lower_garment));
  items.push(buildItem("outerwear", z.outerwear));
  items.push(buildItem("footwear", z.footwear));
  items.push(buildItem("eyewear", z.eyewear));
  items.push(buildItem("bag", z.bag));
  items.push(buildItem("hair", z.hair));
  items.push(buildItem("lips", z.lips));
  items.push(buildItem("fur_trim", z.fur_trim));
  items.push(buildItem("logo_text_detail", z.logo_text_detail));
  items.push(buildItem("accessory_jewelry", z.accessory_jewelry));

  return {
    version: "garment_scaffold_v2",
    detected_items: items.filter(Boolean),
  };
}
/* =========================
   CATEGORY / MODE HELPERS
========================= */

function familyBiasForCategory(category) {
  const c = normalizeCategoryLabel(category, "piece");
  const defaults = {
    jacket: ["anchor", "support", "stabilizer", "accent"],
    shirt: ["support", "anchor", "stabilizer", "accent"],
    sweater: ["support", "anchor", "stabilizer", "accent"],
    hoodie: ["support", "anchor", "stabilizer", "accent"],
    pants: ["stabilizer", "anchor", "support", "accent"],
    shorts: ["stabilizer", "support", "anchor", "accent"],
    shoes: ["stabilizer", "anchor", "support", "accent"],
    boots: ["stabilizer", "anchor", "support", "accent"],
    sneakers: ["stabilizer", "support", "anchor", "accent"],
    accessory: ["accent", "support", "stabilizer", "anchor"],
    piece: ["anchor", "support", "stabilizer", "accent"],
  };
  return defaults[c] || defaults.piece;
}

function buildAmazonSearchLink(query) {
  const tag = process.env.AMAZON_PARTNER_TAG || "visioncore-20";
  const encoded = encodeURIComponent(String(query || "").trim());
  return `https://www.amazon.com/s?k=${encoded}&tag=${tag}`;
}

/* =========================
   CATEGORY / CONTEXT LOCK
========================= */
const CATEGORY_CONTEXT_ANCHORS = {
  jacket: ["fashion", "outfit", "mens"],
  shirt: ["fashion", "outfit", "mens"],
  sweater: ["fashion", "outfit", "mens"],
  hoodie: ["fashion", "outfit", "mens"],
  pants: ["fashion", "outfit", "mens"],
  shorts: ["fashion", "outfit", "mens"],
  shoes: ["fashion", "outfit", "mens"],
  boots: ["fashion", "outfit", "mens"],
  sneakers: ["fashion", "outfit", "mens"],
  accessory: ["fashion", "outfit", "mens"],
  piece: ["fashion", "outfit"],
};

const AMBIGUOUS_COLOR_NEGATIVES = {
  tan: ["-tanning", "-lotion", "-spray", "-self-tanner", "-bronzer", "-skincare", "-cream"],
};

function resolveCategorySubtypes(category) {
  const normalized = normalizeCategoryLabel(category, "piece");
  return CATEGORY_SUBTYPES[normalized] || [normalized];
}

function getCategorySubtypeForIndex(category, idx = 0) {
  const subtypes = resolveCategorySubtypes(category);
  return subtypes[idx % subtypes.length] || normalizeCategoryLabel(category, "piece");
}

function dedupeKeywords(arr) {
  const seen = new Set();
  const out = [];
  for (const value of arr || []) {
    const key = normalizeText(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

function getQueryAnchorsForCategory(category, industry = "fashion") {
  const normalized = normalizeCategoryLabel(category, "piece");
  const anchors = CATEGORY_CONTEXT_ANCHORS[normalized] || [industry];
  const extra = industry && !anchors.includes(industry) ? [industry] : [];
  return dedupeKeywords([...anchors, ...extra]);
}

function getNegativeQueryTermsForKeyword(keyword) {
  const key = normalizeText(keyword);
  return AMBIGUOUS_COLOR_NEGATIVES[key] || [];
}

function buildContextualAmazonQueries({ colorKeyword, category, industry = "fashion", limit = 3 }) {
  const cleanColor = normalizeText(colorKeyword);
  const normalizedCategory = normalizeCategoryLabel(category, "piece");
  const subtypes = resolveCategorySubtypes(normalizedCategory);
  const anchors = getQueryAnchorsForCategory(normalizedCategory, industry);
  const negatives = getNegativeQueryTermsForKeyword(cleanColor);

  const queries = subtypes.slice(0, limit).map((subtype) => {
    const parts = [cleanColor, subtype, ...anchors, ...negatives].filter(Boolean);
    return parts.join(" ");
  });

  return dedupeKeywords(queries);
}

function buildPrimaryContextualQuery({ colorKeyword, category, industry = "fashion", subtype = null }) {
  const cleanColor = normalizeText(colorKeyword);
  const normalizedCategory = normalizeCategoryLabel(category, "piece");
  const anchors = getQueryAnchorsForCategory(normalizedCategory, industry);
  const negatives = getNegativeQueryTermsForKeyword(cleanColor);

  const chosenSubtype =
    normalizeText(subtype) || resolveCategorySubtypes(normalizedCategory)[0] || normalizedCategory;

  const parts = [cleanColor, chosenSubtype, ...anchors, ...negatives].filter(Boolean);
  return parts.join(" ");
}

/* =========================
   COLOR FAMILY (V2 TAXONOMY)
========================= */
function classifyColorV2(dominantHex) {
  const c = chroma(dominantHex);
  const [hRaw, sRaw, lRaw] = c.hsl();
  const h = Number.isFinite(hRaw) ? hRaw : 0;
  const s = clamp01(sRaw || 0);
  const l = clamp01(lRaw || 0);

  let family = "neutral";
  if (s < 0.12) family = "neutral";
  else if (l > 0.78 && s < 0.35) family = "pastel";
  else {
    const earthHue = (h >= 15 && h <= 65) || (h >= 80 && h <= 165);
    if (earthHue && s <= 0.6 && l >= 0.22 && l <= 0.78) family = "earth";
    else if (s >= 0.55) family = "bold";
    else family = "neutral";
  }

  let lane = "other";
  if (h >= 345 || h < 15) lane = "red";
  else if (h >= 15 && h < 45) lane = "orange";
  else if (h >= 45 && h < 75) lane = "yellow";
  else if (h >= 75 && h < 165) lane = "green";
  else if (h >= 165 && h < 210) lane = "cyan";
  else if (h >= 210 && h < 255) lane = "blue";
  else if (h >= 255 && h < 315) lane = "purple";
  else if (h >= 315 && h < 345) lane = "pink";

  const vivid = s >= 0.7;
  const dark = l <= 0.35;

  return { family, lane, vivid, dark, h, s, l };
}

/* =========================
   V2 PALETTE ENGINE
========================= */
function generatePalettesV2(dominantHex) {
  let base = safeHex(dominantHex);

  if (!base || typeof base !== "string") {
    console.warn("⚠️ Invalid dominantHex — forcing fallback");
    base = "#7A7A7A";
  }

  try {
    const meta = classifyColorV2(base);

    const balanceHexes = uniqHexes([
      "#111111",
      "#2B2B2B",
      "#7A7A7A",
      "#CFCFCF",
      "#F5F1E8",
    ]);

    const comp = rotateHue(base, 180);
    const split1 = rotateHue(base, 150);
    const split2 = rotateHue(base, 210);

    const contrastHexes = uniqHexes([
      setTone(comp, { sMul: 1.0, lAdd: meta.dark ? 0.25 : 0.05 }),
      setTone(split1, { sMul: 1.0, lAdd: meta.dark ? 0.25 : 0.05 }),
      setTone(split2, { sMul: 1.0, lAdd: meta.dark ? 0.25 : 0.05 }),
    ]);

    const cohesionHexes = uniqHexes([
      setTone(base, { sMul: 0.85, lAdd: 0.18 }),
      setTone(base, { sMul: 0.75, lAdd: 0.08 }),
      setTone(base, { sMul: 1.0, lAdd: 0.0 }),
      setTone(base, { sMul: 0.9, lAdd: -0.1 }),
      setTone(base, { sMul: 0.8, lAdd: -0.18 }),
    ]);

    let emphasisHexes;
    if (meta.vivid) {
      emphasisHexes = uniqHexes([
        setTone(rotateHue(base, 200), { sMul: 0.85, lAdd: meta.dark ? 0.22 : 0.06 }),
        setTone(rotateHue(base, -200), { sMul: 0.85, lAdd: meta.dark ? 0.22 : 0.06 }),
        setTone(rotateHue(base, 120), { sMul: 0.8, lAdd: meta.dark ? 0.18 : 0.04 }),
      ]);
    } else {
      emphasisHexes = uniqHexes([
        setTone(base, { sMul: 1.25, lAdd: 0.02 }),
        setTone(rotateHue(base, 150), { sMul: 1.1, lAdd: 0.06 }),
        setTone(rotateHue(base, 210), { sMul: 1.1, lAdd: 0.06 }),
      ]);
    }

    const naturalHexes = uniqHexes(
      [
        chroma.mix(base, "#556B2F", 0.55, "lab").hex().toUpperCase(),
        chroma.mix(base, "#8B4513", 0.5, "lab").hex().toUpperCase(),
        chroma.mix(base, "#B87333", 0.45, "lab").hex().toUpperCase(),
        chroma.mix(base, "#D2B48C", 0.55, "lab").hex().toUpperCase(),
        chroma.mix(base, "#2F5D50", 0.55, "lab").hex().toUpperCase(),
      ].map((h) => setTone(h, { sMul: 0.75, lAdd: meta.dark ? 0.18 : 0.0 }))
    );

    const tri1 = rotateHue(base, 120);
    const tri2 = rotateHue(base, 240);
    const tet1 = rotateHue(base, 90);
    const tet2 = rotateHue(base, 270);

    const exploreHexes = uniqHexes([
      setTone(tri1, { sMul: 0.95, lAdd: meta.dark ? 0.22 : 0.05 }),
      setTone(tri2, { sMul: 0.95, lAdd: meta.dark ? 0.22 : 0.05 }),
      setTone(tet1, { sMul: 0.9, lAdd: meta.dark ? 0.22 : 0.05 }),
      setTone(tet2, { sMul: 0.9, lAdd: meta.dark ? 0.22 : 0.05 }),
    ]);

    return {
      dominantHex: base,
      dominantName: getColorName(base),
      classification: {
        family: meta.family,
        lane: meta.lane,
        vivid: meta.vivid,
        h: Math.round(meta.h),
        s: Number(meta.s.toFixed(3)),
        l: Number(meta.l.toFixed(3)),
      },
      palettes: {
        balance: {
          hexes: balanceHexes,
          named_hexes: buildNamedHexes(balanceHexes),
          reason: "Neutral anchors for stability and broad compatibility.",
        },
        contrast: {
          hexes: contrastHexes,
          named_hexes: buildNamedHexes(contrastHexes),
          reason: "Complementary and split-complementary accents with tonal normalization.",
        },
        cohesion: {
          hexes: cohesionHexes,
          named_hexes: buildNamedHexes(cohesionHexes),
          reason: "Same-hue tonal ladder from light to deep for cohesive systems.",
        },
        emphasis: {
          hexes: emphasisHexes,
          named_hexes: buildNamedHexes(emphasisHexes),
          reason: meta.vivid
            ? "Vivid base with controlled accents."
            : "Muted base with boosted saturation and energetic shift.",
        },
        natural: {
          hexes: naturalHexes,
          named_hexes: buildNamedHexes(naturalHexes),
          reason: "Earth blends via LAB mixing with muted toning.",
        },
        explore: {
          hexes: exploreHexes,
          named_hexes: buildNamedHexes(exploreHexes),
          reason: "Triad and tetrad harmonies with tonal normalization.",
        },
      },
    };
  } catch (err) {
    console.error("❌ Palette engine crash:", err);

    return {
      dominantHex: "#7A7A7A",
      dominantName: "Neutral Gray",
      classification: {
        family: "neutral",
        lane: "neutral",
        vivid: false,
        h: 0,
        s: 0,
        l: 0.5,
      },
      palettes: {
        balance: {
          hexes: ["#111111", "#7A7A7A", "#FFFFFF"],
          named_hexes: [],
          reason: "Fallback",
        },
        contrast: {
          hexes: ["#111111", "#FFFFFF"],
          named_hexes: [],
          reason: "Fallback",
        },
        cohesion: {
          hexes: ["#7A7A7A"],
          named_hexes: [],
          reason: "Fallback",
        },
        emphasis: {
          hexes: ["#7A7A7A"],
          named_hexes: [],
          reason: "Fallback",
        },
        natural: {
          hexes: ["#7A7A7A"],
          named_hexes: [],
          reason: "Fallback",
        },
        explore: {
          hexes: ["#7A7A7A"],
          named_hexes: [],
          reason: "Fallback",
        },
      },
    };
  }
}
/* =========================
   OUTFIT SCORING ENGINE
========================= */
const LEGACY_MODE_RULES = {
  Balance: { harmony: 0.34, applicability: 0.28, versatility: 0.24, boldness: 0.14 },
  Contrast: { harmony: 0.2, applicability: 0.2, versatility: 0.2, boldness: 0.4 },
  Cohesion: { harmony: 0.44, applicability: 0.24, versatility: 0.22, boldness: 0.1 },
  Natural: { harmony: 0.4, applicability: 0.3, versatility: 0.2, boldness: 0.1 },
  Explore: { harmony: 0.25, applicability: 0.25, versatility: 0.25, boldness: 0.25 },
};

function normalizeDetectedColors(topColors, dominantHex) {
  return mergeDominantAndImportantColors(topColors, dominantHex)
    .slice(0, 8)
    .map((c) => ({
      ...c,
      structural_role: classifyStructuralRole(c),
    }));
}

function assignColorRoles(normalizedColors) {
  const colors = [...(normalizedColors || [])];
  if (!colors.length) return [];

  const dominantHex = colors[0]?.hex || null;

  const enriched = colors.map((c) => {
    const surfaceRole = classifySurfaceRole(c, dominantHex);
    return {
      ...c,
      surface_role: surfaceRole,
      chroma_magnitude: Number(c?.perceptual?.chroma_magnitude || 0),
      visual_weight: Number(c?.importance?.visual_weight || 0),
      contrast_potential: Number(c?.importance?.contrast_potential || 0),
      highlight_strength: Number(c?.importance?.highlight_strength || 0),
      shadow_strength: Number(c?.importance?.shadow_strength || 0),
      accent_strength: Number(c?.importance?.accent_strength || 0),
      labL: Number(c?.lab?.l || 0),
      pctNum: Number(c?.pct || 0),
    };
  });

  // ANCHOR = dominant body fabric, not trim/detail/highlight
  const anchorCandidates = enriched
    .map((c) => {
      let score = 0;

      score += c.pctNum * 42;
      score += c.visual_weight * 0.34;
      score += 100 - Math.abs(c.labL - 48) * 1.05;
      score += Math.max(0, 22 - Math.abs(c.chroma_magnitude - 24) * 0.35);

      if (c.structural_role === "body") score += 22;
      if (c.structural_role === "trim") score += 4;
      if (c.structural_role === "highlight") score -= 16;
      if (c.structural_role === "shadow") score -= 10;
      if (c.structural_role === "graphic") score -= 22;

      if (c.surface_role === "body_fabric") score += 34;
      if (c.surface_role === "shadow_structure") score += 18;
      if (c.surface_role === "trim") score -= 16;
      if (c.surface_role === "highlight_trim") score -= 20;
      if (c.surface_role === "graphic_detail") score -= 30;
      if (c.surface_role === "micro_accent") score -= 34;

      // prevent tiny accent colors from becoming anchor
      if (c.pctNum <= 0.16) score -= 24;
      if (c.chroma_magnitude > 48 && c.pctNum <= 0.18) score -= 18;

      return { ...c, _anchorScore: clamp100(score) };
    })
    .sort((a, b) => b._anchorScore - a._anchorScore);

  const anchor = anchorCandidates[0] || enriched[0];

  // SUPPORT = color that extends anchor, not another fake warm neutral
  const supportCandidates = enriched
    .filter((c) => c.hex !== anchor.hex)
    .map((c) => {
      let score = 0;

      const dist = colorDistanceLab(anchor.hex, c.hex);
      const hueGap = hueDistance(anchor.hex, c.hex);

      score += 86 - Math.abs(dist - 24) * 0.95;
      score += c.visual_weight * 0.16;
      score += c.pctNum * 10;

      if (c.structural_role === "body") score += 10;
      if (c.structural_role === "trim") score += 8;
      if (c.structural_role === "graphic") score -= 18;
      if (c.structural_role === "highlight") score -= 8;

      if (c.surface_role === "body_fabric") score += 18;
      if (c.surface_role === "shadow_structure") score += 10;
      if (c.surface_role === "trim") score += 6;
      if (c.surface_role === "graphic_detail") score -= 25;
      if (c.surface_role === "micro_accent") score -= 28;
      if (c.surface_role === "highlight_trim") score -= 12;

      // stop muddy earth tones from stealing support unless truly dominant
      if (c.family === "earth" && c.chroma_magnitude < 36 && c.pctNum < 0.22) {
        score -= 48;
      }

      // favor blue / denim / cool / charcoal extension when it reads real
      if (["blue", "cyan", "purple"].includes(c.lane)) score += 16;
      if (c.family === "neutral" && c.chroma_magnitude >= 14) score += 8;

      // support should not be too close to anchor or too wild
      if (dist < 8) score -= 18;
      if (hueGap > 115 && c.chroma_magnitude > 45) score -= 16;

      return { ...c, _roleScore: clamp100(score) };
    })
    .sort((a, b) => b._roleScore - a._roleScore);

  const support = supportCandidates[0] || anchor;

  // ACCENT = high-attention detail, not another neutral body tone
  const accentCandidates = enriched
    .filter((c) => c.hex !== anchor.hex && c.hex !== support.hex)
    .map((c) => {
      let score = 0;

      const dist = colorDistanceLab(anchor.hex, c.hex);
      const hueGap = hueDistance(anchor.hex, c.hex);

      score += Math.min(56, dist * 0.9);
      score += Math.min(26, c.chroma_magnitude * 0.34);
      score += c.contrast_potential * 0.24;
      score += c.accent_strength * 0.26;
      score += c.highlight_strength * 0.12;
      score += c.visual_weight * 0.12;

      if (c.vivid) score += 10;
      if (c.structural_role === "accent") score += 16;
      if (c.structural_role === "graphic") score += 28;
      if (c.structural_role === "highlight") score += 18;
      if (c.structural_role === "body") score -= 14;

      if (c.surface_role === "graphic_detail") score += 36;
      if (c.surface_role === "micro_accent") score += 34;
      if (c.surface_role === "highlight_trim") score += 18;
      if (c.surface_role === "trim") score += 8;
      if (c.surface_role === "body_fabric") score -= 26;
      if (c.surface_role === "shadow_structure") score -= 12;

      // neutrals should almost never win accent unless clearly contrast-driving
      if (c.family === "neutral" && c.chroma_magnitude < 22 && c.contrast_potential < 72) {
        score -= 42;
      }

      // colorful lanes get rewarded
      if (!["neutral", "pastel"].includes(c.family)) score += 12;
      if (["red", "orange", "yellow", "green", "cyan", "blue", "purple", "pink"].includes(c.lane)) {
        score += 8;
      }

      if (hueGap < 10 && c.chroma_magnitude < 30) score -= 20;

      return { ...c, _roleScore: clamp100(score) };
    })
    .sort((a, b) => b._roleScore - a._roleScore);

  const accent =
    accentCandidates[0] ||
    enriched.find((c) => c.hex !== anchor.hex && c.hex !== support.hex) ||
    support;

  // STABILIZER = grounding neutral / shadow / quiet structure
  const stabilizerCandidates = enriched
    .filter((c) => ![anchor.hex, support.hex, accent.hex].includes(c.hex))
    .map((c) => {
      let score = 0;

      score += 54;
      score += c.shadow_strength * 0.2;
      score += c.visual_weight * 0.12;

      if (c.family === "neutral") score += 24;
      if (c.family === "earth" && c.chroma_magnitude < 26) score += 8;
      if (c.chroma_magnitude < 24) score += 16;
      if (c.labL < 46) score += 12;

      if (c.structural_role === "shadow") score += 28;
      if (c.structural_role === "trim") score += 8;
      if (c.structural_role === "highlight") score -= 12;
      if (c.structural_role === "graphic") score -= 20;

      if (c.surface_role === "shadow_structure") score += 24;
      if (c.surface_role === "trim") score += 8;
      if (c.surface_role === "body_fabric") score += 6;
      if (c.surface_role === "graphic_detail") score -= 24;
      if (c.surface_role === "micro_accent") score -= 28;
      if (c.surface_role === "highlight_trim") score -= 16;

      return { ...c, _roleScore: clamp100(score) };
    })
    .sort((a, b) => b._roleScore - a._roleScore);

  const stabilizer =
    stabilizerCandidates[0] ||
    enriched
      .filter((c) => c.hex !== anchor.hex && c.hex !== support.hex)
      .sort((a, b) => a.chroma_magnitude - b.chroma_magnitude)[0] ||
    anchor;

  return [
    {
      hex: anchor.hex,
      name: anchor.name || getColorName(anchor.hex),
      role: "anchor",
      family: titleCase(anchor.family),
      weight: 0.34,
      lab: anchor.lab,
      perceptual: anchor.perceptual,
      importance: anchor.importance,
      structural_role: anchor.structural_role,
    },
    {
      hex: support.hex,
      name: support.name || getColorName(support.hex),
      role: "support",
      family: titleCase(support.family),
      weight: 0.28,
      lab: support.lab,
      perceptual: support.perceptual,
      importance: support.importance,
      structural_role: support.structural_role,
    },
    {
      hex: accent.hex,
      name: accent.name || getColorName(accent.hex),
      role: "accent",
      family: titleCase(accent.family),
      weight: 0.14,
      lab: accent.lab,
      perceptual: accent.perceptual,
      importance: accent.importance,
      structural_role: accent.structural_role,
    },
    {
      hex: stabilizer.hex,
      name: stabilizer.name || getColorName(stabilizer.hex),
      role: "stabilizer",
      family: titleCase(stabilizer.family),
      weight: 0.24,
      lab: stabilizer.lab,
      perceptual: stabilizer.perceptual,
      importance: stabilizer.importance,
      structural_role: stabilizer.structural_role,
    },
  ];
}

function enforceStructuralPreservation(colorRoles, normalizedColors) {
  const roles = [...(colorRoles || [])];

  const highlight = normalizedColors.find((c) => c.structural_role === "highlight");
  const shadow = normalizedColors.find((c) => c.structural_role === "shadow");

  if (highlight && !roles.find((r) => r.hex === highlight.hex)) {
    roles.push({
      hex: highlight.hex,
      name: highlight.name || getColorName(highlight.hex),
      role: "accent",
      family: titleCase(highlight.family || "neutral"),
      weight: 0.14,
      lab: highlight.lab,
      perceptual: highlight.perceptual,
      importance: highlight.importance,
      structural_role: highlight.structural_role,
      forced: true,
    });
  }

  if (shadow && !roles.find((r) => r.hex === shadow.hex)) {
    roles.push({
      hex: shadow.hex,
      name: shadow.name || getColorName(shadow.hex),
      role: "stabilizer",
      family: titleCase(shadow.family || "neutral"),
      weight: 0.24,
      lab: shadow.lab,
      perceptual: shadow.perceptual,
      importance: shadow.importance,
      structural_role: shadow.structural_role,
      forced: true,
    });
  }

  const ordered = [];
  const wanted = ["anchor", "support", "accent", "stabilizer"];

  for (const roleName of wanted) {
    const hit = roles.find((r) => r.role === roleName);
    if (hit && !ordered.find((x) => x.hex === hit.hex)) {
      ordered.push(hit);
    }
  }

  for (const role of roles) {
    if (!ordered.find((x) => x.hex === role.hex) && ordered.length < 4) {
      ordered.push(role);
    }
  }

  return ordered.slice(0, 4);
}

function buildDetectedPalette(colorRoles, normalizedColors) {
  const primary = [];
  const secondary = [];
  const accent = [];

  const roleMap = Object.fromEntries((colorRoles || []).map((r) => [r.role, r.hex]));

  if (roleMap.anchor) primary.push(roleMap.anchor);
  if (roleMap.support) primary.push(roleMap.support);
  if (roleMap.stabilizer) secondary.push(roleMap.stabilizer);

  const extraSecondary = (normalizedColors || [])
    .map((c) => c.hex)
    .filter((hex) => !primary.includes(hex) && !secondary.includes(hex) && hex !== roleMap.accent)
    .slice(0, 2);

  secondary.push(...extraSecondary);

  if (roleMap.accent) accent.push(roleMap.accent);

  const primaryHexes = uniqHexes(primary);
  const secondaryHexes = uniqHexes(secondary);
  const accentHexes = uniqHexes(accent);

  return {
    primary: primaryHexes,
    secondary: secondaryHexes,
    accent: accentHexes,
    named: {
      primary: buildNamedHexes(primaryHexes),
      secondary: buildNamedHexes(secondaryHexes),
      accent: buildNamedHexes(accentHexes),
    },
  };
}

function computeHarmonyScore(colors) {
  if (!colors.length) return 70;
  const distances = [];
  for (let i = 0; i < colors.length; i += 1) {
    for (let j = i + 1; j < colors.length; j += 1) {
      distances.push(colorDistanceLab(colors[i], colors[j]));
    }
  }
  if (!distances.length) return 84;
  const avgDist = avg(distances);
  return Math.round(clamp100(92 - Math.abs(avgDist - 42) * 0.75));
}

function computeApplicabilityScore(colors, colorRoles) {
  if (!colors.length) return 70;
  const neutralCount = colors.filter((hex) => classifyColorV2(hex).family === "neutral").length;
  const earthCount = colors.filter((hex) => classifyColorV2(hex).family === "earth").length;
  const stabilizerExists = (colorRoles || []).some((r) => r.role === "stabilizer");
  const anchorExists = (colorRoles || []).some((r) => r.role === "anchor");
  return Math.round(
    clamp100(62 + neutralCount * 8 + earthCount * 5 + (stabilizerExists ? 8 : 0) + (anchorExists ? 5 : 0))
  );
}

function computeVersatilityScore(colors) {
  if (!colors.length) return 70;
  const sats = colors.map((hex) => getSat(hex));
  const lights = colors.map((hex) => getLight(hex));
  const neutralCount = colors.filter((hex) => classifyColorV2(hex).family === "neutral").length;
  const satAvg = avg(sats);
  const lightSpread = Math.max(...lights) - Math.min(...lights);
  return Math.round(clamp100(58 + neutralCount * 7 + (1 - satAvg) * 18 + Math.min(16, lightSpread * 28)));
}

function computeBoldnessScore(colors) {
  if (!colors.length) return 60;
  const distances = [];
  const sats = colors.map((hex) => getSat(hex));
  const lights = colors.map((hex) => getLight(hex));
  for (let i = 0; i < colors.length; i += 1) {
    for (let j = i + 1; j < colors.length; j += 1) {
      distances.push(hueDistance(colors[i], colors[j]));
    }
  }
  const hueAvg = avg(distances);
  const satAvg = avg(sats);
  const lightSpread = Math.max(...lights) - Math.min(...lights);
  return Math.round(clamp100(22 + Math.min(38, hueAvg * 0.18) + satAvg * 24 + lightSpread * 20));
}

function computeScoreBreakdown(colorRoles, normalizedColors) {
  const roleOrdered = (colorRoles || []).map((r) => r.hex);
  const fallback = (normalizedColors || []).map((c) => c.hex);
  const colors = uniqHexes([...roleOrdered, ...fallback]).slice(0, 5);

  return {
    harmony: computeHarmonyScore(colors),
    applicability: computeApplicabilityScore(colors, colorRoles),
    versatility: computeVersatilityScore(colors),
    boldness: computeBoldnessScore(colors),
  };
}

function normalizeEngineModeScores(modeScores = {}) {
  if (Array.isArray(modeScores)) {
    return modeScores
      .map((entry) => ({ mode: entry?.mode, score: Number(entry?.score) || 0 }))
      .filter((entry) => entry.mode)
      .sort((a, b) => b.score - a.score);
  }

  return Object.entries(modeScores)
    .map(([mode, score]) => ({ mode, score: Number(score) || 0 }))
    .sort((a, b) => b.score - a.score);
}

function toEngineModeScores(modeScores = []) {
  if (!Array.isArray(modeScores)) return modeScores || {};
  return modeScores.reduce((acc, entry) => {
    if (entry?.mode) acc[entry.mode] = Number(entry.score) || 0;
    return acc;
  }, {});
}

function computeOverallScore(scoreBreakdown) {
  if (typeof scoreEngine?.computeOverallScore === "function") {
    return scoreEngine.computeOverallScore(scoreBreakdown);
  }

  return Math.round(
    clamp100(
      scoreBreakdown.harmony * 0.32 +
        scoreBreakdown.applicability * 0.28 +
        scoreBreakdown.versatility * 0.24 +
        scoreBreakdown.boldness * 0.16
    )
  );
}

function computeModeScore(mode, scoreBreakdown) {
  if (typeof scoreEngine?.computeModeScore === "function") {
    return scoreEngine.computeModeScore(mode, scoreBreakdown);
  }

  const weights = LEGACY_MODE_RULES[mode];
  if (!weights) return 0;

  return Math.round(
    clamp100(
      scoreBreakdown.harmony * weights.harmony +
        scoreBreakdown.applicability * weights.applicability +
        scoreBreakdown.versatility * weights.versatility +
        scoreBreakdown.boldness * weights.boldness
    )
  );
}

function computeModeScores(scoreBreakdown) {
  if (typeof scoreEngine?.computeModeScores === "function") {
    return normalizeEngineModeScores(scoreEngine.computeModeScores(scoreBreakdown));
  }

  return Object.keys(LEGACY_MODE_RULES)
    .map((mode) => ({
      mode,
      score: computeModeScore(mode, scoreBreakdown),
    }))
    .sort((a, b) => b.score - a.score);
}

function getBestMode(modeScores) {
  const normalizedModeScores = normalizeEngineModeScores(modeScores);
  if (!normalizedModeScores.length) return { mode: "Balance", score: 0 };

  if (typeof scoreEngine?.getBestMode === "function") {
    const bestMode = scoreEngine.getBestMode(toEngineModeScores(normalizedModeScores));
    const bestScore = normalizedModeScores.find((entry) => entry.mode === bestMode)?.score ?? 0;
    return { mode: bestMode || normalizedModeScores[0].mode, score: bestScore };
  }

  return normalizedModeScores[0];
}

function scoreOutfit(scoreBreakdown) {
  if (typeof scoreEngine?.scoreOutfit === "function") {
    const scored = scoreEngine.scoreOutfit(scoreBreakdown);
    const modeScores = normalizeEngineModeScores(scored?.modeScores || computeModeScores(scoreBreakdown));
    const best = getBestMode(modeScores);

    return {
      outfit_score: scored?.overallScore ?? computeOverallScore(scoreBreakdown),
      best_mode: scored?.bestMode || best.mode,
      best_mode_score: modeScores.find((entry) => entry.mode === (scored?.bestMode || best.mode))?.score ?? best.score,
      score_breakdown: scored?.scoreBreakdown || scoreBreakdown,
      mode_scores: modeScores,
    };
  }

  const modeScores = computeModeScores(scoreBreakdown);
  const best = getBestMode(modeScores);

  return {
    outfit_score: computeOverallScore(scoreBreakdown),
    best_mode: best.mode,
    best_mode_score: best.score,
    score_breakdown: scoreBreakdown,
    mode_scores: modeScores,
  };
}

/* =========================
   STYLE IDENTITY SYSTEM
========================= */

function deriveStyleIdentity(bestMode, scoreBreakdown = {}) {
  const identity = deriveStyleIdentityFromStyleIdentity(bestMode, scoreBreakdown);

  return {
    modifier: identity.modifier,
    base_archetype: identity.base_archetype,
    label: identity.label,
  };
}

function buildWhyThisWorks(colorRoles) {
  const anchor = colorRoles.find((r) => r.role === "anchor");
  const support = colorRoles.find((r) => r.role === "support");
  const accent = colorRoles.find((r) => r.role === "accent");
  const stabilizer = colorRoles.find((r) => r.role === "stabilizer");

  const anchorTraits = anchor?.perceptual || {};
  const supportTraits = support?.perceptual || {};
  const accentTraits = accent?.perceptual || {};
  const stabilizerTraits = stabilizer?.perceptual || {};

  const anchorDescriptor = `${anchorTraits.depth || "mid"} ${anchorTraits.temperature || "balanced"} ${anchor?.name || anchor?.hex || "anchor tone"}`;
  const supportDescriptor = `${supportTraits.intensity || "balanced"} ${support?.name || support?.hex || "support tone"}`;
  const stabilizerDescriptor = `${stabilizerTraits.intensity || "balanced"} ${stabilizer?.name || stabilizer?.hex || "stabilizer tone"}`;
  const accentDescriptor = `${accentTraits.intensity || "balanced"} ${accent?.name || accent?.hex || "accent tone"}`;

  return `The ${anchorDescriptor} anchor establishes the visual center, while ${supportDescriptor} extends the palette with compatible support. ${stabilizerDescriptor} adds grounding stability, and ${accentDescriptor} introduces controlled emphasis without overwhelming the overall structure.`;
}

function buildSuggestedAdjustment(scoreBreakdown, colorRoles, bestMode) {
  const mode = normalizeModeLabel(bestMode);

  const accent = colorRoles.find((r) => r.role === "accent");
  const stabilizer = colorRoles.find((r) => r.role === "stabilizer");
  const support = colorRoles.find((r) => r.role === "support");
  const anchor = colorRoles.find((r) => r.role === "anchor");

  const accentName = accent?.name || accent?.hex || "the accent tone";
  const stabilizerName = stabilizer?.name || stabilizer?.hex || "the stabilizer tone";
  const supportName = support?.name || support?.hex || "the support tone";
  const anchorName = anchor?.name || anchor?.hex || "the anchor tone";

  if (mode === "Natural") {
    if (scoreBreakdown.boldness > 70) {
      return `This look performs best in Natural mode. Softening the intensity of ${accentName} slightly would create a more grounded and organic balance.`;
    }

    if (scoreBreakdown.versatility < 75) {
      return `This look performs best in Natural mode. Introducing a slightly more neutral or earthy support tone alongside ${supportName} would improve versatility.`;
    }

    return `This look performs best in Natural mode. Deepening ${stabilizerName} slightly would enhance grounding and elevate the overall composition.`;
  }

  if (mode === "Cohesion") {
    if (scoreBreakdown.boldness > 65) {
      return `This look performs best in Cohesion mode. Reducing the intensity of ${accentName} would improve tonal unity and strengthen overall harmony.`;
    }

    return `This look performs best in Cohesion mode. Tightening the tonal range around the ${anchorName} anchor would create a more seamless and refined visual flow.`;
  }

  if (mode === "Contrast") {
    if (scoreBreakdown.boldness < 60) {
      return `This look performs best in Contrast mode. Increasing the separation between ${anchorName} and ${accentName} would create stronger visual impact.`;
    }

    return `This look performs best in Contrast mode. Slightly sharpening the contrast between tones would make the composition feel more dynamic.`;
  }

  if (mode === "Balance") {
    if (scoreBreakdown.boldness > 75) {
      return `This look performs best in Balance mode. Slightly reducing the dominance of ${accentName} would improve overall equilibrium.`;
    }

    return `This look performs best in Balance mode. Reinforcing ${stabilizerName} would create a more even distribution across the palette.`;
  }

  if (mode === "Explore") {
    return `This look performs best in Explore mode. You can push variation further by introducing a more unexpected accent while maintaining structure through ${anchorName}.`;
  }

  return `Refining the relationship between ${anchorName}, ${supportName}, and ${accentName} would improve the overall outfit score.`;
}

function buildOutfitAnalysis({ dominantHex, topColors, segmentedRegions = [], dinoGarmentRegions = [], pipeline = null }) {
  const normalizedColors = normalizeDetectedColors(topColors, dominantHex);
  const baseRoles = assignColorRoles(normalizedColors);
  const colorRoles = enforceStructuralPreservation(baseRoles, normalizedColors);

  const visualIntelligence = buildVisualIntelligence({
    dominantHex,
    normalizedColors,
    colorRoles,
  });

  const inputSegmentedRegions = Array.isArray(segmentedRegions) ? segmentedRegions : [];
  const samRegions = inputSegmentedRegions.filter(
    (region) => region?.source_type !== "grounding_dino" && region?.source_type !== "dino_detection"
  );
  const inputDinoRegions = inputSegmentedRegions.filter(
    (region) => region?.source_type === "grounding_dino" || region?.source_type === "dino_detection"
  );
  const dinoRegions = [...inputDinoRegions, ...(Array.isArray(dinoGarmentRegions) ? dinoGarmentRegions : [])].filter(
    (region, idx, arr) => idx === arr.findIndex((candidate) => candidate?.segment_label === region?.segment_label && candidate?.zone === region?.zone)
  );
  const samZones = new Set(samRegions.map((region) => region?.zone).filter((zone) => zone && zone !== "unknown"));
  const dedupedDinoRegions = samRegions.length
    ? dinoRegions.filter((region) => !samZones.has(region?.zone))
    : dinoRegions;
  const garmentEvidenceRegions = samRegions.length ? samRegions.concat(dedupedDinoRegions) : dinoRegions;
  const garmentZoneSource = getGarmentZoneSource(samRegions, dedupedDinoRegions);

  const garmentZones = inferGarmentZones(
    normalizedColors,
    colorRoles,
    visualIntelligence,
    garmentEvidenceRegions
  );

  const garmentAnalysis = inferGarmentAndMaterial({
    zones: garmentZones?.zones,
    normalizedColors,
  });

  const scoreBreakdown = computeScoreBreakdown(colorRoles, normalizedColors);
  const scoredOutfit = scoreOutfit(scoreBreakdown);
  const modeScores = scoredOutfit.mode_scores;
  const best = getBestMode(modeScores);
  const detectedPalette = buildDetectedPalette(colorRoles, normalizedColors);
  const styleIdentity = deriveStyleIdentity(best.mode, scoreBreakdown);
  const visualImportance = collectImportantColors(topColors, dominantHex);
  const outfitScore = scoredOutfit.outfit_score;

  return {
    analysis_type: "outfit_score",
    outfit_score: outfitScore,
    best_mode: best.mode,
    best_mode_score: best.score,
    score_breakdown: scoreBreakdown,
    mode_scores: modeScores,
    detected_palette: detectedPalette,
    color_roles: colorRoles,
    style_identity: styleIdentity,
    why_this_works: buildWhyThisWorks(colorRoles),
    suggested_adjustment: buildSuggestedAdjustment(scoreBreakdown, colorRoles, best.mode),
    visual_importance: visualImportance,
    visual_intelligence: visualIntelligence,
    visual_intelligence_layer: visualIntelligence,
    garment_zones: garmentZones,
    segmented_regions: garmentZones.segmented_regions || garmentEvidenceRegions,
    region_color_analysis: garmentZones.region_color_analysis || [],
    detail_colors: visualIntelligence?.body_vs_detail?.detail_colors || [],
    accessory_analysis: (garmentAnalysis?.detected_items || []).filter((item) =>
      ["accessory_jewelry", "eyewear", "bag"].includes(item.type)
    ),
    confidence_scores: {
      outfit: outfitScore,
      best_mode: best.score,
      zones: Object.fromEntries(
        Object.entries(garmentZones?.zones || {}).map(([k, v]) => [k, Number(v?.confidence || v?.score || 0)])
      ),
    },
    material_analysis: garmentAnalysis,
    pipeline: pipeline ? { ...pipeline, garment_zone_source: garmentZoneSource } : {
      sam_enabled: false,
      sam_ok: false,
      sam_reason: "not_requested",
      fallback_mode: true,
      garment_zone_source: garmentZoneSource,
    },
    garment_analysis: garmentAnalysis,
    structural_analysis: normalizedColors.map((c) => ({
      hex: c.hex,
      name: c.name,
      structural_role: c.structural_role,
      surface_role: classifySurfaceRole(c, dominantHex),
      importance: c.importance,
    })),
  };
}

/* =========================
   RETRIEVAL INTENT + PIECE SCORING
========================= */
function getRoleHexMap(outfitAnalysis) {
  const roles = Array.isArray(outfitAnalysis?.color_roles) ? outfitAnalysis.color_roles : [];
  return {
    anchor: roles.find((r) => r.role === "anchor")?.hex || null,
    support: roles.find((r) => r.role === "support")?.hex || null,
    accent: roles.find((r) => r.role === "accent")?.hex || null,
    stabilizer: roles.find((r) => r.role === "stabilizer")?.hex || null,
  };
}

function getDisplayPaletteForRetrieval(outfitAnalysis) {
  const roleMap = getRoleHexMap(outfitAnalysis);
  const detected = outfitAnalysis?.detected_palette || {};

  return {
    anchor: roleMap.anchor,
    support: roleMap.support,
    stabilizer: roleMap.stabilizer,
    accent: roleMap.accent,
    primary: Array.isArray(detected.primary) ? detected.primary : [],
    secondary: Array.isArray(detected.secondary) ? detected.secondary : [],
    accent_group: Array.isArray(detected.accent) ? detected.accent : [],
    named: detected.named || {
      primary: buildNamedHexes(Array.isArray(detected.primary) ? detected.primary : []),
      secondary: buildNamedHexes(Array.isArray(detected.secondary) ? detected.secondary : []),
      accent: buildNamedHexes(Array.isArray(detected.accent) ? detected.accent : []),
    },
  };
}

function getRetailColorKeywords(hex) {
  const safe = safeHex(hex);
  if (!safe) return [];

  const h = getHue(safe);
  const s = getSat(safe);
  const l = getLight(safe);

  if (s < 0.08 && l < 0.18) return ["black", "jet black", "deep black"];
  if (s < 0.12 && l < 0.42) return ["charcoal", "dark gray", "graphite"];
  if (s < 0.12 && l < 0.68) return ["gray", "slate gray", "stone"];
  if (s < 0.16 && l >= 0.82) return ["white", "off white", "ivory"];
  if (s < 0.18 && l >= 0.68) return ["cream", "light beige", "oatmeal"];

  if (h >= 345 || h < 15) return l < 0.45 ? ["burgundy", "wine", "oxblood"] : ["red", "crimson", "rose"];
  if (h >= 15 && h < 35) return l < 0.5 ? ["brown", "cognac", "rust"] : ["tan", "camel", "caramel"];
  if (h >= 35 && h < 55) return l < 0.5 ? ["mustard", "golden brown", "amber"] : ["beige", "sand", "khaki"];
  if (h >= 55 && h < 85) return ["olive", "sage", "moss"];
  if (h >= 85 && h < 165) return l < 0.45 ? ["forest green", "olive green", "deep green"] : ["sage green", "muted green", "green"];
  if (h >= 165 && h < 210) return ["teal", "blue green", "sea green"];
  if (h >= 210 && h < 255) {
    if (l < 0.3 && !isNavyCandidate(safe)) return ["black", "graphite black", "charcoal"];
    return l < 0.45 ? ["navy", "deep blue", "midnight blue"] : ["blue", "steel blue", "powder blue"];
  }
  if (h >= 255 && h < 315) return l < 0.45 ? ["plum", "eggplant", "deep purple"] : ["lavender", "soft purple", "mauve"];
  return ["neutral", "muted", "classic"];
}

function getNegativeKeywordsForMode(mode) {
  const selectedMode = normalizeModeLabel(mode);
  const map = {
    Balance: ["neon", "rainbow", "multi-color", "graphic"],
    Contrast: ["washed out", "faded neutral only"],
    Cohesion: ["neon", "multi-color", "graphic", "rainbow"],
    Natural: ["neon", "patent", "highlighter", "fluorescent"],
    Explore: [],
  };
  return map[selectedMode] || [];
}

function getStyleKeywordsForMode(mode) {
  const selectedMode = normalizeModeLabel(mode);
  const map = {
    Balance: ["balanced", "versatile", "clean"],
    Contrast: ["contrast", "bold", "statement"],
    Cohesion: ["cohesive", "tonal", "clean"],
    Natural: ["natural", "earth tone", "muted"],
    Explore: ["experimental", "creative", "expressive"],
  };
  return map[selectedMode] || [];
}

const OCCASION_SEARCH_KEYWORDS = Object.freeze({
  formal: Object.freeze(["formal", "tailored", "dress"]),
  business: Object.freeze(["business", "professional", "business casual"]),
  business_casual: Object.freeze(["business casual", "professional"]),
  streetwear: Object.freeze(["streetwear", "urban"]),
  athleisure: Object.freeze(["athleisure", "activewear"]),
  evening: Object.freeze(["evening", "night out"]),
  casual: Object.freeze(["casual", "everyday"]),
  smart_casual: Object.freeze(["smart casual"]),
});

function getOccasionSearchKeywords(occasion) {
  const normalizedOccasion = normalizeText(occasion).replace(/[\s-]+/g, "_");
  if (!OCCASION_IDS.includes(normalizedOccasion)) return [];
  return OCCASION_SEARCH_KEYWORDS[normalizedOccasion] || [];
}

function getRolePriorityForModeAndTarget(mode, targetItem) {
  const selectedMode = normalizeModeLabel(mode);
  const categoryBias = familyBiasForCategory(targetItem);

  const modeBias = {
    Balance: ["anchor", "stabilizer", "support", "accent"],
    Contrast: ["accent", "anchor", "support", "stabilizer"],
    Cohesion: ["anchor", "support", "stabilizer", "accent"],
    Natural: ["support", "anchor", "stabilizer", "accent"],
    Explore: ["accent", "support", "anchor", "stabilizer"],
  }[selectedMode] || ["anchor", "support", "stabilizer", "accent"];

  const merged = [];
  for (const role of [...categoryBias, ...modeBias]) {
    if (!merged.includes(role)) merged.push(role);
  }
  return merged;
}

function buildSearchTermsFromIntent(retrievalIntent) {
  const category = normalizeCategoryLabel(retrievalIntent?.target_item, "piece");
  const palettePriority = Array.isArray(retrievalIntent?.palette_priority) ? retrievalIntent.palette_priority : [];
  const mode = normalizeModeLabel(retrievalIntent?.selected_mode);

  const colorKeywords = dedupeKeywords(palettePriority.flatMap((entry) => getRetailColorKeywords(entry?.hex)));

  return {
    primary_keywords: CATEGORY_SEARCH_KEYWORDS[category] || CATEGORY_SEARCH_KEYWORDS.piece,
    color_keywords: colorKeywords,
    style_keywords: dedupeKeywords([
      ...getStyleKeywordsForMode(mode),
      ...getOccasionSearchKeywords(retrievalIntent?.occasion),
    ]),
    negative_keywords: getNegativeKeywordsForMode(mode),
  };
}

function buildRetrievalIntent(outfitAnalysis, opts = {}) {
  const normalizedOccasion = normalizeText(opts.occasion).replace(/[\s-]+/g, "_");
  const occasion = OCCASION_IDS.includes(normalizedOccasion) ? normalizedOccasion : "";
  const occasionTargetDefault = OCCASION_CATEGORIES[occasion]?.[0];
  const occasionModeDefault = OCCASION_MODES[occasion]?.[0];
  const hasExplicitSelectedMode = normalizeText(opts.selectedMode) !== "";
  const rawTargetItem = normalizeText(opts.targetItem);
  const selectedMode = normalizeModeLabel(
    hasExplicitSelectedMode ? opts.selectedMode : occasionModeDefault || outfitAnalysis?.best_mode || "Balance"
  );
  const sourceItem = normalizeCategoryLabel(opts.sourceItem || "piece", "piece");
  const targetItem = normalizeCategoryLabel(
    !rawTargetItem || rawTargetItem === "piece" ? occasionTargetDefault || "piece" : opts.targetItem,
    "piece"
  );
  const industry = normalizeText(opts.industry || "fashion") || "fashion";
  const matchStrictness = normalizeText(opts.matchStrictness || "medium") || "medium";
  const resultCount = Number.isFinite(Number(opts.resultCount))
    ? Math.max(1, Math.min(60, Number(opts.resultCount)))
    : 24;
  const rolePriorityOrder = getRolePriorityForModeAndTarget(selectedMode, targetItem);
  const roleMap = getRoleHexMap(outfitAnalysis);
  const roleObjects = Array.isArray(outfitAnalysis?.color_roles) ? outfitAnalysis.color_roles : [];

  const palettePriority = rolePriorityOrder
    .map((role, idx) => {
      const roleHex = roleMap[role];
      const roleObj = roleObjects.find((r) => r.role === role);
      if (!roleHex) return null;
      return {
        role,
        hex: roleHex,
        name: roleObj?.name || getColorName(roleHex),
        priority: idx + 1,
        usage_bias: familyBiasForCategory(targetItem),
      };
    })
    .filter(Boolean);

  const intent = {
    analysis_type: "inventory_retrieval",
    selected_mode: selectedMode,
    best_mode_score: outfitAnalysis?.best_mode_score ?? 0,
    source_item: sourceItem,
    target_item: targetItem,
    industry,
    retrieval_goal: opts.retrievalGoal || "extend_palette",
    match_strictness: matchStrictness,
    result_count: resultCount,
    initial_display_count: 4,
    expanded_display_count: Math.max(8, Math.min(resultCount, 12)),
    role_priority: rolePriorityOrder,
    palette_priority: palettePriority,
    palette: getDisplayPaletteForRetrieval(outfitAnalysis),
    context: {
      domain: industry,
      category: targetItem,
      subtypes: resolveCategorySubtypes(targetItem),
      anchors: getQueryAnchorsForCategory(targetItem, industry),
    },
    ranking_rules: {
      prefer_role_order: rolePriorityOrder,
      prefer_neutrals_first:
        selectedMode === "Natural" || targetItem === "pants" || targetItem === "shoes" || targetItem === "boots",
      allow_accent_results: true,
      accent_max_ratio: selectedMode === "Contrast" || selectedMode === "Explore" ? 0.35 : 0.15,
      min_color_fit_score: matchStrictness === "strict" ? 78 : matchStrictness === "loose" ? 52 : 64,
    },
  };

  if (occasion) {
    Object.defineProperty(intent, "occasion", {
      value: occasion,
      enumerable: false,
      configurable: true,
    });
  }

  intent.search_terms = buildSearchTermsFromIntent(intent);
  return intent;
}

function normalizeInventoryProduct(product, idx = 0) {
  const title = String(product?.title || product?.name || product?.product_title || `Product ${idx + 1}`);
  const category = normalizeCategoryLabel(product?.category || product?.type || product?.itemType || "piece", "piece");
  const colorHex = safeHex(
    product?.color_hex ||
      product?.colorHex ||
      product?.hex ||
      product?.dominantHex ||
      product?.dominant_hex
  );

  const styleTags = Array.isArray(product?.style_tags)
    ? product.style_tags
    : Array.isArray(product?.styleTags)
      ? product.styleTags
      : [];

  return {
    ...product,
    id: product?.id || product?.product_id || `product_${idx + 1}`,
    title,
    category,
    color_hex: colorHex,
    color_name: colorHex ? getColorName(colorHex) : null,
    brand: product?.brand || null,
    image_url: product?.image_url || product?.imageUrl || null,
    affiliate_link: product?.affiliate_link || product?.affiliateLink || null,
    style_tags: styleTags,
  };
}

function getStrictnessScalar(matchStrictness) {
  const m = normalizeText(matchStrictness);
  if (m === "strict") return 1.2;
  if (m === "loose") return 0.8;
  return 1.0;
}

function computeRoleFitForProduct(productHex, retrievalIntent) {
  const palettePriority = Array.isArray(retrievalIntent?.palette_priority) ? retrievalIntent.palette_priority : [];
  if (!productHex || !palettePriority.length) {
    return { score: 55, matchedRole: null, matchedHex: null };
  }

  const strictnessScalar = getStrictnessScalar(retrievalIntent.match_strictness);
  let best = { score: 0, matchedRole: null, matchedHex: null };

  palettePriority.forEach((entry) => {
    const dist = colorDistanceLab(productHex, entry.hex);
    const priorityWeight = Math.max(0.2, 1 - (entry.priority - 1) * 0.18);
    const baseScore = clamp100(100 - dist * 1.15 * strictnessScalar);
    const score = clamp100(baseScore * priorityWeight);
    if (score > best.score) {
      best = { score: Math.round(score), matchedRole: entry.role, matchedHex: entry.hex };
    }
  });

  return best;
}

function computeModeAlignmentForProduct(productHex, retrievalIntent) {
  if (!productHex) return 45;

  const mode = normalizeModeLabel(retrievalIntent?.selected_mode);
  const roleMap = {
    anchor: retrievalIntent?.palette_priority?.find((x) => x.role === "anchor")?.hex || null,
    support: retrievalIntent?.palette_priority?.find((x) => x.role === "support")?.hex || null,
    stabilizer: retrievalIntent?.palette_priority?.find((x) => x.role === "stabilizer")?.hex || null,
    accent: retrievalIntent?.palette_priority?.find((x) => x.role === "accent")?.hex || null,
  };

  const anchor = roleMap.anchor;
  const support = roleMap.support;
  const stabilizer = roleMap.stabilizer;
  const accent = roleMap.accent;

  const family = classifyColorV2(productHex).family;
  const sat = getSat(productHex);

  if (mode === "Cohesion") {
    const d1 = anchor ? colorDistanceLab(productHex, anchor) : 40;
    const d2 = support ? colorDistanceLab(productHex, support) : 40;
    return Math.round(clamp100(96 - Math.min(d1, d2) * 1.05));
  }

  if (mode === "Contrast") {
    const ref = anchor || support || stabilizer || accent;
    const hueGap = ref ? hueDistance(productHex, ref) : 90;
    return Math.round(clamp100(30 + Math.min(60, hueGap * 0.55) + sat * 12));
  }

  if (mode === "Natural") {
    const goodFamily = family === "earth" || family === "neutral" || family === "pastel";
    return Math.round(clamp100((goodFamily ? 82 : 58) + (1 - sat) * 12));
  }

  if (mode === "Balance") {
    const d1 = anchor ? colorDistanceLab(productHex, anchor) : 40;
    const d2 = stabilizer ? colorDistanceLab(productHex, stabilizer) : 40;
    const avgDist = avg([d1, d2]);
    return Math.round(clamp100(88 - Math.abs(avgDist - 30) * 0.9));
  }

  if (mode === "Explore") {
    return Math.round(clamp100(62 + sat * 18));
  }

  return 70;
}

function computeCategoryFitForProduct(product, retrievalIntent) {
  const target = normalizeCategoryLabel(retrievalIntent?.target_item, "piece");
  const category = normalizeCategoryLabel(product?.category || "piece", "piece");
  const title = normalizeText(product?.title || "");

  if (target === category) return 96;
  if (title.includes(target)) return 88;
  if (target === "jacket" && CATEGORY_COMPATIBILITY.jacket?.includes(category)) return 85;
  if (target === "shirt" && CATEGORY_COMPATIBILITY.shirt?.includes(category)) return 85;
  if (target === "pants" && CATEGORY_COMPATIBILITY.pants?.includes(category)) return 86;
  if (target === "shoes" && CATEGORY_COMPATIBILITY.shoes?.includes(category)) return 84;
  if (target === "accessory" && ["bag", "cap", "belt", "watch"].some((x) => title.includes(x))) return 84;

  const occasion = normalizeText(retrievalIntent?.occasion).replace(/[\s-]+/g, "_");
  const occasionDefaultTarget = normalizeCategoryLabel(OCCASION_CATEGORIES[occasion]?.[0], "piece");
  const allowsOccasionCategoryBoost =
    OCCASION_IDS.includes(occasion) && target === occasionDefaultTarget;
  if (
    allowsOccasionCategoryBoost &&
    OCCASION_CATEGORIES[occasion]?.some((occasionCategory) => normalizeCategoryLabel(occasionCategory, "piece") === category)
  ) {
    return 84;
  }

  return 58;
}

function computeVersatilityFitForProduct(productHex) {
  if (!productHex) return 55;
  const family = classifyColorV2(productHex).family;
  const sat = getSat(productHex);
  const light = getLight(productHex);

  let score = 58;
  if (family === "neutral") score += 24;
  if (family === "earth") score += 15;
  if (family === "pastel") score += 10;
  score += (1 - sat) * 10;
  if (light > 0.15 && light < 0.86) score += 8;
  return Math.round(clamp100(score));
}

function computeColorFitForProduct(productHex, retrievalIntent) {
  if (!productHex) return 0;
  const palettePriority = Array.isArray(retrievalIntent?.palette_priority) ? retrievalIntent.palette_priority : [];
  if (!palettePriority.length) return 0;

  const strictnessScalar = getStrictnessScalar(retrievalIntent.match_strictness);
  const distances = palettePriority.map((entry) => colorDistanceLab(productHex, entry.hex));
  const bestDist = Math.min(...distances);
  return Math.round(clamp100(100 - bestDist * 1.2 * strictnessScalar));
}

function scoreProductFit(product, retrievalIntent) {
  const normalized = normalizeInventoryProduct(product);
  const roleFit = computeRoleFitForProduct(normalized.color_hex, retrievalIntent);
  const colorFit = computeColorFitForProduct(normalized.color_hex, retrievalIntent);
  const modeAlignment = computeModeAlignmentForProduct(normalized.color_hex, retrievalIntent);
  const categoryFit = computeCategoryFitForProduct(normalized, retrievalIntent);
  const versatilityFit = computeVersatilityFitForProduct(normalized.color_hex);

  const pieceFitScore = Math.round(
    clamp100(
      colorFit * 0.28 +
        roleFit.score * 0.24 +
        modeAlignment * 0.18 +
        categoryFit * 0.18 +
        versatilityFit * 0.12
    )
  );

  return {
    ...normalized,
    piece_fit_score: pieceFitScore,
    score_breakdown: {
      color_fit: colorFit,
      role_fit: roleFit.score,
      mode_alignment: modeAlignment,
      category_fit: categoryFit,
      versatility_fit: versatilityFit,
    },
    matched_role: roleFit.matchedRole,
    matched_mode: retrievalIntent?.selected_mode || null,
    why_it_matches:
      roleFit.matchedRole
        ? `Strong ${roleFit.matchedRole} alignment for ${retrievalIntent?.selected_mode || "selected"} mode with solid category relevance.`
        : `General palette fit for ${retrievalIntent?.selected_mode || "selected"} mode.`,
  };
}

function rankProducts(products, retrievalIntent) {
  const rows = Array.isArray(products) ? products : [];
  return rows
    .map((product, idx) => scoreProductFit(normalizeInventoryProduct(product, idx), retrievalIntent))
    .filter((item) => item.piece_fit_score >= (retrievalIntent?.ranking_rules?.min_color_fit_score || 0) * 0.9)
    .sort((a, b) => b.piece_fit_score - a.piece_fit_score);
}

function generateRetrievalPreviewProducts(retrievalIntent) {
  const palettePriority = Array.isArray(retrievalIntent?.palette_priority) ? retrievalIntent.palette_priority : [];
  const target = normalizeCategoryLabel(retrievalIntent?.target_item, "piece");
  const out = [];

  palettePriority.forEach((entry, idx) => {
    const keyword = getRetailColorKeywords(entry.hex)[0] || "Classic";
    const subtype = getCategorySubtypeForIndex(target, idx);

    out.push({
      id: `preview_${entry.role}_${idx + 1}`,
      title: `${titleCase(keyword)} ${titleCase(subtype)}`,
      category: target,
      color_hex: entry.hex,
      color_name: entry.name || getColorName(entry.hex),
      brand: "Preview",
      affiliate_link: buildAmazonSearchLink(
        buildPrimaryContextualQuery({
          colorKeyword: keyword,
          category: target,
          industry: retrievalIntent?.industry || "fashion",
          subtype,
        })
      ),
      image_url: null,
      style_tags: [normalizeModeLabel(retrievalIntent.selected_mode).toLowerCase(), entry.role],
    });
  });

  if (palettePriority[0]?.hex) {
    const distractorHex = safeHex(rotateHue(palettePriority[0].hex, 130)) || "#FF4D4D";
    out.push({
      id: "preview_distractor_1",
      title: `Bright Accent ${titleCase(getCategorySubtypeForIndex(target, 0))}`,
      category: target,
      color_hex: distractorHex,
      color_name: getColorName(distractorHex),
      brand: "Preview",
      affiliate_link: buildAmazonSearchLink(`bright ${getCategorySubtypeForIndex(target, 0)} fashion outfit`),
      image_url: null,
      style_tags: ["experimental"],
    });
  }

  return out;
}

function shopperLabelForRole(role) {
  const map = {
    anchor: "Best Match",
    support: "Soft Match",
    stabilizer: "Safe Neutral",
    accent: "Bold Option",
  };
  return map[role] || titleCase(role);
}

function shopperReasonForRole(role) {
  const map = {
    anchor: "Best extension for maintaining the look.",
    support: "Blends smoothly with the palette.",
    stabilizer: "Grounds the outfit with a stable neutral.",
    accent: "Adds a stronger pop if you want more energy.",
  };
  return map[role] || "Recommended match for this direction.";
}

function buildRoleQueries(retrievalIntent) {
  const target = normalizeCategoryLabel(retrievalIntent?.target_item, "piece");
  const palettePriority = Array.isArray(retrievalIntent?.palette_priority) ? retrievalIntent.palette_priority : [];

  return palettePriority.map((entry, idx) => {
    const keywords = getRetailColorKeywords(entry.hex);
    const subtype = getCategorySubtypeForIndex(target, idx);

    const primaryQuery = buildPrimaryContextualQuery({
      colorKeyword: keywords[0],
      category: target,
      industry: retrievalIntent?.industry || "fashion",
      subtype,
    });

    const expandedQueries = dedupeKeywords(
      keywords.flatMap((keyword) =>
        buildContextualAmazonQueries({
          colorKeyword: keyword,
          category: target,
          industry: retrievalIntent?.industry || "fashion",
          limit: 3,
        })
      )
    ).slice(0, 3);

    return {
      role: entry.role,
      shopper_label: shopperLabelForRole(entry.role),
      color_hex: entry.hex,
      color_name: entry.name || getColorName(entry.hex),
      subtype,
      primary_query: primaryQuery,
      expanded_queries: expandedQueries,
      amazon_link: buildAmazonSearchLink(primaryQuery),
      expanded_links: expandedQueries.map((q) => ({
        query: q,
        amazon_link: buildAmazonSearchLink(q),
      })),
      reason: shopperReasonForRole(entry.role),
    };
  });
}

function buildAlternativeDirections(outfitAnalysis, opts = {}) {
  const current = normalizeModeLabel(opts.currentMode || outfitAnalysis?.best_mode || "Balance");
  const targetItem = normalizeCategoryLabel(opts.targetItem || "piece", "piece");

  return (Array.isArray(outfitAnalysis?.mode_scores) ? outfitAnalysis.mode_scores : [])
    .filter((row) => normalizeModeLabel(row.mode) !== current)
    .slice(0, 3)
    .map((row) => ({
      mode: normalizeModeLabel(row.mode),
      score: row.score,
      target_item: targetItem,
      action_label: `Try ${normalizeModeLabel(row.mode)}`,
    }));
}

function buildShoppingAssist(outfitAnalysis, retrievalIntent, rankedProducts = []) {
  const displayCount = retrievalIntent?.initial_display_count || 4;
  const expandedCount = retrievalIntent?.expanded_display_count || 12;

  const roleQueries = buildRoleQueries(retrievalIntent);
  const roleQueryMap = Object.fromEntries(roleQueries.map((row) => [row.role, row]));

  const topResults = rankedProducts.slice(0, displayCount).map((product) => {
    const fallbackRole = product.matched_role || "support";
    const roleRow = roleQueryMap[fallbackRole] || roleQueries[0] || null;

    return {
      id: product.id,
      title: product.title,
      shopper_label: shopperLabelForRole(fallbackRole),
      role: fallbackRole,
      reason: roleRow?.reason || shopperReasonForRole(fallbackRole),
      piece_fit_score: product.piece_fit_score,
      matched_mode: product.matched_mode,
      color_hex: product.color_hex,
      color_name: product.color_name || (product.color_hex ? getColorName(product.color_hex) : null),
      amazon_link:
        product.affiliate_link ||
        roleRow?.amazon_link ||
        buildAmazonSearchLink(
          buildPrimaryContextualQuery({
            colorKeyword: getRetailColorKeywords(product.color_hex)[0] || "classic",
            category: retrievalIntent.target_item,
            industry: retrievalIntent?.industry || "fashion",
            subtype: roleRow?.subtype || getCategorySubtypeForIndex(retrievalIntent.target_item, 0),
          })
        ),
      query:
        roleRow?.primary_query ||
        buildPrimaryContextualQuery({
          colorKeyword: getRetailColorKeywords(product.color_hex)[0] || "classic",
          category: retrievalIntent.target_item,
          industry: retrievalIntent?.industry || "fashion",
          subtype: roleRow?.subtype || getCategorySubtypeForIndex(retrievalIntent.target_item, 0),
        }),
      why_it_matches: product.why_it_matches,
    };
  });

  const moreOptions = rankedProducts.slice(displayCount, expandedCount).map((product) => {
    const fallbackRole = product.matched_role || "support";
    const roleRow = roleQueryMap[fallbackRole] || roleQueries[0] || null;

    return {
      id: product.id,
      title: product.title,
      shopper_label: shopperLabelForRole(fallbackRole),
      role: fallbackRole,
      piece_fit_score: product.piece_fit_score,
      color_hex: product.color_hex,
      color_name: product.color_name || (product.color_hex ? getColorName(product.color_hex) : null),
      amazon_link:
        product.affiliate_link ||
        roleRow?.amazon_link ||
        buildAmazonSearchLink(
          buildPrimaryContextualQuery({
            colorKeyword: getRetailColorKeywords(product.color_hex)[0] || "classic",
            category: retrievalIntent.target_item,
            industry: retrievalIntent?.industry || "fashion",
            subtype: roleRow?.subtype || getCategorySubtypeForIndex(retrievalIntent.target_item, 0),
          })
        ),
      query:
        roleRow?.primary_query ||
        buildPrimaryContextualQuery({
          colorKeyword: getRetailColorKeywords(product.color_hex)[0] || "classic",
          category: retrievalIntent.target_item,
          industry: retrievalIntent?.industry || "fashion",
          subtype: roleRow?.subtype || getCategorySubtypeForIndex(retrievalIntent.target_item, 0),
        }),
    };
  });

  return {
    target_item: retrievalIntent.target_item,
    source_item: retrievalIntent.source_item,
    selected_mode: retrievalIntent.selected_mode,
    best_mode_score: retrievalIntent.best_mode_score,
    intro: `Top picks for building this look further with a ${retrievalIntent.target_item}.`,
    top_paths: topResults,
    more_options: {
      available: moreOptions.length > 0,
      count: moreOptions.length,
      label: "More Options",
      items: moreOptions,
    },
    role_search_paths: roleQueries,
    try_another_direction: buildAlternativeDirections(outfitAnalysis, {
      currentMode: retrievalIntent.selected_mode,
      targetItem: retrievalIntent.target_item,
    }),
  };
}

const REPLICATE_SAM_TIMEOUT_MS = 90000;
const REPLICATE_SAM_POLL_MS = 1200;
const REPLICATE_SAM_POLL_RETRY_MAX = 3;
const REPLICATE_SAM_POLL_RETRY_DELAY_MIN_MS = 500;
const REPLICATE_SAM_POLL_RETRY_DELAY_MAX_MS = 1200;
const DEFAULT_REPLICATE_SAM_VERSION =
  process.env.REPLICATE_SAM_VERSION ||
  "b88dc2ea8f814e5f4af2bac79f2414079800b5035b065d4eab99c857ab67e125";
const DEFAULT_REPLICATE_SAM_MODEL = process.env.REPLICATE_SAM_MODEL || "meta/sam-2";
const DEFAULT_REPLICATE_GROUNDING_DINO_VERSION =
  process.env.REPLICATE_GROUNDING_DINO_VERSION ||
  "efd10a8ddc57ea28773327e881ce95e20cc1d734c589f7dd01d2036921ed78aa";
const DEFAULT_GROUNDING_DINO_QUERY =
  process.env.GROUNDING_DINO_QUERY ||
  "person. hat. bag. shoes. boots. sneakers. sweater. hoodie. shirt. jacket. pants. shorts. skirt. glasses. accessory.";

function getSamPredictionsUrl(modelId = DEFAULT_REPLICATE_SAM_MODEL) {
  const configured = String(process.env.REPLICATE_SAM_MODEL_PREDICTIONS_URL || "").trim();
  if (configured) return configured;
  return `https://api.replicate.com/v1/models/${modelId}/predictions`;
}

async function replicateRequest(url, options = {}, timeoutMs = REPLICATE_SAM_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const method = String(options?.method || "GET").toUpperCase();
  let bodyTopLevelKeys = [];
  if (typeof options?.body === "string" && options.body.trim()) {
    try {
      const parsedBody = JSON.parse(options.body);
      if (parsedBody && typeof parsedBody === "object" && !Array.isArray(parsedBody)) {
        bodyTopLevelKeys = Object.keys(parsedBody);
      }
    } catch {
      bodyTopLevelKeys = [];
    }
  }

  console.info("[SAM DEBUG] Replicate request dispatch", {
    method,
    url,
    bodyTopLevelKeys,
  });

  try {
    const resp = await fetch(url, {
      ...options,
      method,
      signal: controller.signal,
    });
    const text = await resp.text();

    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch (parseError) {
      console.warn("[SAM DEBUG] Replicate response JSON parse failed", {
        url,
        parseError: parseError?.message || String(parseError),
        preview: String(text || "").slice(0, 240),
      });
      data = null;
    }

    if (!resp.ok) {
      throw new Error(data?.detail || `Replicate request failed (${resp.status})`);
    }

    return data;
  } catch (error) {
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
  const alpha = Number(maskRgba[idx + 3] || 0);
  if (alpha > 0) return alpha;
  return (Number(maskRgba[idx] || 0) + Number(maskRgba[idx + 1] || 0) + Number(maskRgba[idx + 2] || 0)) / 3;
}

function extractMaskedRegionColors(baseImage, maskImage, limit = 6) {
  const baseW = Number(baseImage?.width || 0);
  const baseH = Number(baseImage?.height || 0);
  const maskW = Number(maskImage?.width || 0);
  const maskH = Number(maskImage?.height || 0);
  if (!baseW || !baseH || !maskW || !maskH) return [];

  const buckets = new Map();
  let pixelCount = 0;

  for (let my = 0; my < maskH; my += 1) {
    for (let mx = 0; mx < maskW; mx += 1) {
      const mIdx = (my * maskW + mx) * 4;
      if (getMaskStrength(maskImage.data, mIdx) < 25) continue;

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

function sortLowerGarmentColors(colorRows = []) {
  return [...colorRows].sort((a, b) => {
    const aGreen = isChromaticGreenOrOlive(a);
    const bGreen = isChromaticGreenOrOlive(b);
    const aNeutralDark = isNeutralDarkColor(a);
    const bNeutralDark = isNeutralDarkColor(b);
    const aScore = a.pct * (aGreen ? 1.55 : 1) * (aNeutralDark ? 0.72 : 1);
    const bScore = b.pct * (bGreen ? 1.55 : 1) * (bNeutralDark ? 0.72 : 1);
    return bScore - aScore;
  });
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
  let backgroundLike = 0;

  for (const sampleBbox of sampleBboxes) {
    const stride = Math.max(1, Math.floor(Math.sqrt((sampleBbox.width * sampleBbox.height) / 3000)));
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
        samples.push({ r, g, b, bg, skin, ...traits });
      }
    }
  }

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

  const rankedColorRows = zoneKey === "lower_garment" ? sortLowerGarmentColors(colorRows) : colorRows;
  const clusters = buildColorClusters(rankedColorRows);
  const rankedClusters = zoneKey === "lower_garment" ? sortLowerGarmentColors(clusters.map((cluster) => ({ ...cluster, hex: cluster.base }))) : clusters;
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
      sample_count: samples.length,
      filtered_sample_count: usableSamples.length,
      dominant_hex_before_cluster: colorRows[0]?.hex || null,
      expected_dominant_color: zoneKey === "lower_garment" ? (colors[0]?.hex || null) : null,
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
    });
    const regionColors = extraction.colors || [];
    if (!regionColors.length) return region;
    const dominantHex = safeHex(regionColors[0]?.hex || region?.dominant_hex || "");
    return {
      ...region,
      dominant_hex: dominantHex || region?.dominant_hex || null,
      region_colors: regionColors,
      color_debug: {
        ...(region?.color_debug || {}),
        dino_bbox_sampling: extraction.debug,
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

  const isOn = (x, y) => {
    if (x < 0 || y < 0 || x >= maskW || y >= maskH) return false;
    const idx = (y * maskW + x) * 4;
    return getMaskStrength(maskImage.data, idx) >= 25;
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
        importance,
      };
    })
    .filter((x) => !!x.hex);

  const groundingDino = await runGroundingDinoDetection(ghostUrl, DEFAULT_GROUNDING_DINO_QUERY);
  const dinoDetections = Array.isArray(groundingDino?.detections) ? groundingDino.detections : [];
  let dinoGarmentRegions = buildDinoSegmentedRegions(dinoDetections);
  let dinoColorEnrichmentReason = dinoGarmentRegions.length ? "no_bbox_color_enrichment" : "no_dino_garment_regions";
  try {
    if (dinoGarmentRegions.some((region) => !!region?.bbox)) {
      const ghostBuffer = await fetchImageBuffer(ghostUrl);
      dinoGarmentRegions = extractColorsFromDinoBboxes(ghostBuffer, dinoGarmentRegions);
      dinoColorEnrichmentReason = "bbox_color_extraction_complete";
    } else if (dinoGarmentRegions.length) {
      dinoColorEnrichmentReason = "no_dino_bboxes";
    }
  } catch (error) {
    dinoColorEnrichmentReason = error?.message || "bbox_color_extraction_failed";
  }
  const dinoColorEnrichmentCount = dinoGarmentRegions.filter((region) => safeHex(region?.dominant_hex) && Array.isArray(region?.region_colors) && region.region_colors.length > 0).length;
  const dinoColorEnrichmentOk = dinoColorEnrichmentCount > 0;
  const dinoDebug = {
    enabled: !!groundingDino?.enabled,
    ok: !!groundingDino?.ok,
    reason: groundingDino?.reason || null,
    detection_count: dinoDetections.length,
    garment_region_count: dinoGarmentRegions.length,
    dino_color_enrichment_count: dinoColorEnrichmentCount,
    dino_color_enrichment_ok: dinoColorEnrichmentOk,
    dino_color_enrichment_reason: dinoColorEnrichmentReason,
    detections: dinoDetections,
    garment_regions: dinoGarmentRegions,
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
    try {
      v2 = generatePalettesV2(analysis.dominantHex);
      outfitAnalysis = buildOutfitAnalysis({
        dominantHex: analysis.dominantHex,
        topColors: analysis.topColors,
        segmentedRegions,
        dinoGarmentRegions: analysis.dinoGarmentRegions,
        pipeline: analysis.pipeline,
      });
    } catch (error) {
      return sendStepError(res, 500, "palette_engine", error);
    }

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
      outfit_analysis: outfitAnalysis,
      debug: {
        dino: analysis.dino_debug,
        pipeline: {
          ...analysis.pipeline,
          lower_sampling_version: LOWER_SAMPLING_VERSION,
        },
      },
      summary:
        "Primary color detected. Use Balance, Contrast, Cohesion, Natural, or Explore for structured mode-specific directions.",
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
app.listen(PORT, () => {
  console.log(`✅ CIE Core backend running on port ${PORT}`);
});
