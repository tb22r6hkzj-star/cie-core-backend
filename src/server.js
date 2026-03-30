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

dotenv.config();

const app = express();
const PORT = process.env.PORT || 10000;
const PIXELCUT_TIMEOUT_MS = 45000;

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
   PREMIUM HUMAN COLOR NAMES
========================= */
function getColorName(hex) {
  const safe = safeHex(hex);
  if (!safe) return "Unknown";

  const h = getHue(safe);
  const s = getSat(safe);
  const l = getLight(safe);

  const lab = getLab(safe);
  const chromaMagnitude = getChromaMagnitudeFromLab(lab);

  // =========================
  // TRUE NEUTRALS
  // =========================
  if (s < 0.05 && l < 0.10) return "Jet Black";
  if (s < 0.07 && l < 0.18) return "Graphite Black";
  if (s < 0.09 && l < 0.28) return "Charcoal";
  if (s < 0.10 && l < 0.40) return "Slate Gray";
  if (s < 0.10 && l >= 0.42 && l <= 0.70) return "Graphite";
  if (s < 0.08 && l >= 0.70 && l <= 0.90) return "Chrome Silver";
  if (s < 0.12 && l < 0.58) return "Stone Gray";
  if (s < 0.12 && l < 0.74) return "Ash Gray";
  if (s < 0.10 && l > 0.93) return "Soft White";
  if (s < 0.15 && l > 0.84) return "Linen White";
  if (s < 0.18 && l > 0.74) return "Ivory";
  if (s < 0.22 && l > 0.64) return "Soft Linen";

  // =========================
  // MUTED / WASHED DETECTION (CRITICAL FIX)
  // =========================
  const isMuted = chromaMagnitude < 32 || s < 0.32;
  const isSoft = l >= 0.32 && l <= 0.78;

  if (isMuted && isSoft) {
    if (h >= 205 && h < 235) return l < 0.52 ? "Muted Blue" : "Dusty Blue";
    if (h >= 235 && h < 255) return l < 0.52 ? "Washed Indigo" : "Periwinkle Blue";
    if (h >= 175 && h < 205) return "Muted Teal";
    if (h >= 255 && h < 290) return "Dusty Violet";
    if (h >= 105 && h < 165) return "Muted Sage";
    if (h >= 15 && h < 28) return l < 0.52 ? "Luxury Tan" : "Soft Camel";
    if (h >= 28 && h < 40) return l < 0.52 ? "Muted Tan" : "Soft Sand";
    if (h >= 40 && h < 65) return "Warm Sand";
    if (h >= 315 || h < 15) return "Dusty Rose";
  }

  // =========================
  // STRONG COLOR NAMING
  // =========================
  if (h >= 345 || h < 8) return l < 0.48 ? "Deep Crimson" : "Rose";
  if (h >= 8 && h < 18) return l < 0.46 ? "Brick Red" : "Coral";
  if (h >= 315 && h < 333) return l < 0.54 ? "Berry" : "Dusty Rose";
  if (h >= 333 && h < 345) return l < 0.52 ? "Muted Lip Rose" : "Soft Blush";

  if (h >= 18 && h < 28) return l < 0.42 ? "Rich Brown" : "Desert Tan";
  if (h >= 28 && h < 40) return l < 0.48 ? "Cognac" : "Camel";
  if (h >= 40 && h < 50) return l < 0.52 ? "Burnt Umber" : "Warm Sand";
  if (h >= 50 && h < 60) return l < 0.56 ? "Golden Amber" : "Sand Beige";

  if (h >= 60 && h < 78) return l < 0.48 ? "Olive" : "Soft Olive";
  if (h >= 78 && h < 105) return l < 0.50 ? "Olive Green" : "Muted Sage";
  if (h >= 105 && h < 145) return l < 0.44 ? "Forest Green" : "Sage";
  if (h >= 145 && h < 175) return l < 0.44 ? "Deep Teal" : "Teal";

  if (h >= 175 && h < 205) return l < 0.50 ? "Steel Teal" : "Sea Blue";
  if (h >= 205 && h < 228) return l < 0.38 ? "Midnight Navy" : "Steel Blue";
  if (h >= 228 && h < 250) return l < 0.40 ? "Deep Navy" : "Powder Blue";

  if (h >= 250 && h < 280) return l < 0.48 ? "Royal Purple" : "Periwinkle";
  if (h >= 280 && h < 315) return l < 0.54 ? "Plum" : "Lavender";

  return "Refined Neutral";
}

function buildNamedHex(hex) {
  const safe = safeHex(hex);
  return safe ? { hex: safe, name: getColorName(safe) } : null;
}

function buildNamedHexes(hexes) {
  return uniqHexes(hexes).map(buildNamedHex).filter(Boolean);
}

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

function inferZoneColorRead(zoneKey, zoneData, normalizedColors = [], regionColors = [], useRegionOnly = false) {
  const fallbackName = zoneData?.name || titleCase(String(zoneKey || "unknown").replace(/_/g, " "));

  if (!zoneData?.hex) {
    return {
      mode: "single",
      cluster_count: 0,
      interpretation: "unknown",
      display_label: fallbackName,
      dominant_color: null,
      support_colors: [],
      accent_colors: [],
      confidence: 0,
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
  const dominant = {
    base: baseHex,
    pct: 1,
  };

  let displayLabel = getColorName(dominant.base);
  let mode = "single";
  let interpretation = "single_color";

  if (
    zoneKey === "lower_garment" &&
    clusters.some((c) => {
      const h = getHue(c.base);
      return h >= 200 && h <= 245;
    }) &&
    clusters.every((c) => getPerceptualTraits(c.base).chroma_magnitude < 40)
  ) {
    displayLabel = "Light Wash Denim";
    mode = "washed_fabric";
    interpretation = "denim";
  } else if (zoneKey === "footwear" && clusters.length >= 3) {
    displayLabel = "Multicolor Sneaker";
    mode = "multicolor";
    interpretation = "multi_material";
  } else if (
    ["accessory_jewelry", "bag", "eyewear"].includes(zoneKey) &&
    clusters.length >= 3
  ) {
    displayLabel = "Multicolor Accessory";
    mode = "multicolor";
    interpretation = "patterned";
  }

  const zoneConfidence = Math.round(
    clamp100(Number(zoneData?.score || 0) * 0.55 + Number(zoneData?.confidence || 0) * 0.45)
  );

  return {
    mode,
    cluster_count: clusters.length,
    interpretation,
    display_label: displayLabel,
    confidence: zoneConfidence,
    dominant_color: {
      hex: dominant.base,
      name: getColorName(dominant.base),
      pct: round2(dominant.pct),
    },
    support_colors: clusters.slice(1, 3).map((c) => ({
      hex: c.base,
      name: getColorName(c.base),
      pct: round2(c.pct),
    })),
    accent_colors: clusters.slice(3, 5).map((c) => ({
      hex: c.base,
      name: getColorName(c.base),
      pct: round2(c.pct),
    })),
  };
}

function getZoneFromLabel(label = "") {
  const t = normalizeText(label);
  if (/upper|shirt|top|torso/.test(t)) return "upper_garment";
  if (/lower|pants|trouser|jean|skirt/.test(t)) return "lower_garment";
  if (/outer|jacket|coat|blazer/.test(t)) return "outerwear";
  if (/shoe|boot|sneaker|foot/.test(t)) return "footwear";
  if (/eyewear|glass|sunglass/.test(t)) return "eyewear";
  if (/bag|purse|tote|handbag/.test(t)) return "bag";
  if (/hair/.test(t)) return "hair";
  if (/lip/.test(t)) return "lips";
  if (/fur|trim/.test(t)) return "fur_trim";
  if (/logo|text|graphic|print/.test(t)) return "logo_text_detail";
  if (/accessor|jewel|necklace|watch|ring|bracelet|earring/.test(t)) return "accessory_jewelry";
  return "unknown";
}

function inferGarmentZones(normalizedColors = [], colorRoles = [], visualIntelligence = {}, segmentedRegions = []) {
  const roleByName = Object.fromEntries((colorRoles || []).map((r) => [r.role, r]));
  const dominant = visualIntelligence?.dominant_body_color || roleByName.anchor || normalizedColors[0] || null;
  const secondary = roleByName.support || normalizedColors[1] || dominant;
  const accent = roleByName.accent || normalizedColors[2] || secondary;
  const stabilizer = roleByName.stabilizer || normalizedColors[3] || secondary;

  const segmentedByZone = {};
  for (const region of segmentedRegions || []) {
    const zone = region?.zone && region.zone !== "unknown" ? region.zone : getZoneFromLabel(region?.segment_label);
    if (!segmentedByZone[zone]) segmentedByZone[zone] = [];
    segmentedByZone[zone].push(region);
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

    const hasSamRegion = zoneRegions.length > 0;
    const chosenColor = regionColors[0]?.hex
      ? { ...fallbackColor, hex: regionColors[0].hex, pct: regionColors[0].pct }
      : fallbackColor;

    const zoneData = buildZoneCandidate(chosenColor, zoneKey, Math.max(45, Math.round((chosenColor?.pct || 0.25) * 100)));
    const zoneRead = inferZoneColorRead(zoneKey, zoneData, normalizedColors, regionColors, hasSamRegion);

    zones[zoneKey] = {
      ...zoneData,
      ...zoneRead,
    };

    const dominantObj = buildSegmentedColorObject({
      color: { hex: zoneRead?.dominant_color?.hex, pct: zoneRead?.dominant_color?.pct },
      zone: zoneKey,
      role: "dominant",
      sourceType: hasSamRegion ? "sam_segment" : "global_palette",
      segmentLabel: zoneRegions[0]?.segment_label || zoneKey,
      confidence: zoneRead?.confidence || zoneData?.score || 0,
    });

    if (dominantObj) regionColorAnalysis.push(dominantObj);

    for (const support of zoneRead.support_colors || []) {
      const obj = buildSegmentedColorObject({
        color: support,
        zone: zoneKey,
        role: "support",
        sourceType: hasSamRegion ? "sam_segment" : "global_palette",
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
        sourceType: hasSamRegion ? "sam_segment" : "global_palette",
        segmentLabel: zoneRegions[0]?.segment_label || zoneKey,
        confidence: Math.max(35, (zoneRead?.confidence || 0) - 16),
      });
      if (obj) regionColorAnalysis.push(obj);
    }
  }

  return {
    version: "garment_zone_v3",
    segmented_regions: segmentedRegions,
    zones,
    region_color_analysis: regionColorAnalysis,
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
    return h >= 200 && h <= 245;
  });

  const lowChroma = clusters.every(
    (c) => Number(getPerceptualTraits(c.base)?.chroma_magnitude || 0) < 38
  );

  const midLight = clusters.some((c) => {
    const l = getLight(c.base);
    return l >= 0.38 && l <= 0.82;
  });

  return blueClusters.length >= 1 && lowChroma && midLight;
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

    const zoneColors = getZoneColors(zoneData.hex);
    const clusters = buildColorClusters(zoneColors.length ? zoneColors : [zoneData]);
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

    return {
      type,
      confidence: zoneData.score || 60,
      material,
      material_confidence: materialConfidence,
      cluster_count: clusters.length,
      display_label: displayLabel,
      dominant_color: {
        hex: dominant.base,
        name: getColorName(dominant.base),
        pct: round2(dominant.pct),
      },
      support_colors: clusters.slice(1, 3).map((c) => ({
        hex: c.base,
        name: getColorName(c.base),
        pct: round2(c.pct),
      })),
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
function normalizeModeLabel(mode) {
  const m = normalizeText(mode);
  const map = {
    balance: "Balance",
    contrast: "Contrast",
    cohesion: "Cohesion",
    natural: "Natural",
    explore: "Explore",
    emphasis: "Explore",
  };
  return map[m] || "Balance";
}

function normalizeCategoryLabel(value, fallback = "piece") {
  const text = normalizeText(value);
  if (!text) return fallback;

  const map = {
    jackets: "jacket",
    jacket: "jacket",
    outerwear: "jacket",
    coat: "jacket",
    bomber: "jacket",
    overshirt: "jacket",

    shirts: "shirt",
    shirt: "shirt",
    tee: "shirt",
    "t-shirt": "shirt",
    top: "shirt",
    tops: "shirt",
    "button up": "shirt",

    sweaters: "sweater",
    sweater: "sweater",
    knit: "sweater",
    cardigan: "sweater",
    cardigans: "sweater",
    pullover: "sweater",

    hoodies: "hoodie",
    hoodie: "hoodie",
    sweatshirt: "hoodie",

    pants: "pants",
    trousers: "pants",
    jeans: "pants",
    chinos: "pants",
    bottoms: "pants",

    shorts: "shorts",

    shoes: "shoes",
    footwear: "shoes",
    loafers: "shoes",

    boots: "boots",
    sneakers: "sneakers",
    trainers: "sneakers",

    accessories: "accessory",
    accessory: "accessory",
    bag: "accessory",
    bags: "accessory",
    hat: "accessory",
    hats: "accessory",
    belt: "accessory",
    belts: "accessory",
    watch: "accessory",
    strap: "accessory",
  };

  return map[text] || text;
}

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
const CATEGORY_SUBTYPE_MAP = {
  jacket: ["jacket", "bomber jacket", "overshirt", "coat"],
  shirt: ["shirt", "tee", "button up", "top"],
  sweater: ["sweater", "knit sweater", "cardigan", "pullover"],
  hoodie: ["hoodie", "zip hoodie", "sweatshirt", "pullover hoodie"],
  pants: ["pants", "trousers", "jeans", "chinos"],
  shorts: ["shorts", "tailored shorts"],
  shoes: ["shoes", "sneakers", "loafers", "footwear"],
  boots: ["boots", "chelsea boots", "leather boots"],
  sneakers: ["sneakers", "trainers", "low top sneakers"],
  accessory: ["crossbody bag", "shoulder bag", "belt", "cap", "watch strap"],
  piece: ["fashion piece", "style piece"],
};

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
  return CATEGORY_SUBTYPE_MAP[normalized] || [normalized];
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
const MODE_RULES = {
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

function computeModeScores(scoreBreakdown) {
  return Object.entries(MODE_RULES)
    .map(([mode, weights]) => ({
      mode,
      score: Math.round(
        clamp100(
          scoreBreakdown.harmony * weights.harmony +
            scoreBreakdown.applicability * weights.applicability +
            scoreBreakdown.versatility * weights.versatility +
            scoreBreakdown.boldness * weights.boldness
        )
      ),
    }))
    .sort((a, b) => b.score - a.score);
}

/* =========================
   STYLE IDENTITY SYSTEM
========================= */
function deriveBaseArchetype(bestMode) {
  const mode = normalizeModeLabel(bestMode);

  const map = {
    Cohesion: "Minimalist",
    Natural: "Natural",
    Balance: "Classic",
    Contrast: "Statement",
    Explore: "Creative",
  };

  return map[mode] || "Classic";
}

function deriveModifier(scoreBreakdown = {}) {
  const harmony = Number(scoreBreakdown.harmony || 0);
  const applicability = Number(scoreBreakdown.applicability || 0);
  const versatility = Number(scoreBreakdown.versatility || 0);
  const boldness = Number(scoreBreakdown.boldness || 0);

  if (boldness >= 82) return "Bold";
  if (harmony >= 86 && boldness <= 45) return "Controlled";
  if (versatility >= 90) return "Modern";
  if (applicability >= 88) return "Refined";

  if (
    harmony >= 78 &&
    applicability >= 78 &&
    versatility >= 78 &&
    boldness >= 40 &&
    boldness <= 75
  ) {
    return "Balanced";
  }

  if (boldness <= 38) return "Soft";

  return "Modern";
}

function deriveStyleIdentity(bestMode, scoreBreakdown = {}) {
  const modifier = deriveModifier(scoreBreakdown);
  const baseArchetype = deriveBaseArchetype(bestMode);

  return {
    modifier,
    base_archetype: baseArchetype,
    label: `${modifier} ${baseArchetype}`,
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

function buildOutfitAnalysis({ dominantHex, topColors, segmentedRegions = [], pipeline = null }) {
  const normalizedColors = normalizeDetectedColors(topColors, dominantHex);
  const baseRoles = assignColorRoles(normalizedColors);
  const colorRoles = enforceStructuralPreservation(baseRoles, normalizedColors);

  const visualIntelligence = buildVisualIntelligence({
    dominantHex,
    normalizedColors,
    colorRoles,
  });

  const garmentZones = inferGarmentZones(
    normalizedColors,
    colorRoles,
    visualIntelligence,
    segmentedRegions
  );

  const garmentAnalysis = inferGarmentAndMaterial({
    zones: garmentZones?.zones,
    normalizedColors,
  });

  const scoreBreakdown = computeScoreBreakdown(colorRoles, normalizedColors);
  const modeScores = computeModeScores(scoreBreakdown);
  const best = modeScores[0] || { mode: "Balance", score: 0 };
  const detectedPalette = buildDetectedPalette(colorRoles, normalizedColors);
  const styleIdentity = deriveStyleIdentity(best.mode, scoreBreakdown);
  const visualImportance = collectImportantColors(topColors, dominantHex);

  const outfitScore = Math.round(
    clamp100(
      scoreBreakdown.harmony * 0.32 +
        scoreBreakdown.applicability * 0.28 +
        scoreBreakdown.versatility * 0.24 +
        scoreBreakdown.boldness * 0.16
    )
  );

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
    segmented_regions: garmentZones.segmented_regions || segmentedRegions,
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
    pipeline: pipeline || {
      sam_enabled: false,
      sam_ok: false,
      sam_reason: "not_requested",
      fallback_mode: true,
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
  if (h >= 210 && h < 255) return l < 0.45 ? ["navy", "deep blue", "midnight blue"] : ["blue", "steel blue", "powder blue"];
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

  const categoryKeywordsMap = {
    jacket: ["jacket", "overshirt", "bomber jacket", "coat"],
    shirt: ["shirt", "tee", "button up", "top"],
    sweater: ["sweater", "knit sweater", "cardigan", "pullover"],
    hoodie: ["hoodie", "zip hoodie", "sweatshirt", "pullover hoodie"],
    pants: ["pants", "trousers", "jeans", "chinos"],
    shorts: ["shorts", "tailored shorts"],
    shoes: ["shoes", "sneakers", "loafers", "footwear"],
    boots: ["boots", "chelsea boots", "leather boots"],
    sneakers: ["sneakers", "trainers", "low top sneakers"],
    accessory: ["crossbody bag", "shoulder bag", "belt", "cap", "watch strap"],
    piece: ["fashion piece"],
  };

  const colorKeywords = dedupeKeywords(palettePriority.flatMap((entry) => getRetailColorKeywords(entry?.hex)));

  return {
    primary_keywords: categoryKeywordsMap[category] || categoryKeywordsMap.piece,
    color_keywords: colorKeywords,
    style_keywords: getStyleKeywordsForMode(mode),
    negative_keywords: getNegativeKeywordsForMode(mode),
  };
}

function buildRetrievalIntent(outfitAnalysis, opts = {}) {
  const selectedMode = normalizeModeLabel(opts.selectedMode || outfitAnalysis?.best_mode || "Balance");
  const sourceItem = normalizeCategoryLabel(opts.sourceItem || "piece", "piece");
  const targetItem = normalizeCategoryLabel(opts.targetItem || "piece", "piece");
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
  if (target === "jacket" && ["coat", "outerwear", "overshirt"].includes(category)) return 85;
  if (target === "shirt" && ["top", "tee"].includes(category)) return 85;
  if (target === "pants" && ["jeans", "trousers"].includes(category)) return 86;
  if (target === "shoes" && ["boots", "sneakers", "footwear", "loafers"].includes(category)) return 84;
  if (target === "accessory" && ["bag", "cap", "belt", "watch"].some((x) => title.includes(x))) return 84;
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

const REPLICATE_SAM_TIMEOUT_MS = 25000;
const REPLICATE_SAM_POLL_MS = 1200;
const REPLICATE_SAM_MODEL = "meta/sam-2";
const REPLICATE_SAM_MODEL_PREDICTIONS_URL = `https://api.replicate.com/v1/models/${REPLICATE_SAM_MODEL}/predictions`;

async function replicateRequest(url, options = {}, timeoutMs = REPLICATE_SAM_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const resp = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    const text = await resp.text();

    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
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

function parseSamOutputToRegions(output) {
  if (!output) return [];

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
        const dominantHex = safeHex(regionColors[0]?.hex || region?.dominant_hex || "");

        return {
          ...region,
          dominant_hex: dominantHex || region?.dominant_hex || null,
          region_colors: regionColors,
        };
      } catch {
        return region;
      }
    })
  );
}

async function runSamSegmentation(imageUrl) {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) {
    console.warn("[SAM DEBUG] Skipping SAM segmentation: missing REPLICATE_API_TOKEN");
    return {
      enabled: false,
      ok: false,
      reason: "missing_REPLICATE_API_TOKEN",
      regions: [],
    };
  }

  try {
    console.info("[SAM DEBUG] Starting SAM segmentation request", {
      imageUrl,
      model: REPLICATE_SAM_MODEL,
    });
    const createResp = await replicateRequest(REPLICATE_SAM_MODEL_PREDICTIONS_URL, {
      method: "POST",
      headers: {
        Authorization: `Token ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        input: {
          image: imageUrl,
        },
      }),
    });

    const statusUrl = createResp?.urls?.get;
    if (!statusUrl) {
      console.error("[SAM DEBUG] SAM create response missing poll URL");
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
      prediction = await replicateRequest(statusUrl, {
        method: "GET",
        headers: { Authorization: `Token ${token}` },
      });
      console.info("[SAM DEBUG] SAM prediction poll", {
        id: prediction?.id || createResp?.id || null,
        status: prediction?.status || "unknown",
      });
    }

    if (prediction?.status !== "succeeded") {
      console.error("[SAM DEBUG] SAM segmentation did not succeed", {
        status: prediction?.status || "unknown",
        error: prediction?.error || null,
      });
      return {
        enabled: true,
        ok: false,
        reason: prediction?.error || prediction?.status || "unknown_failure",
        regions: [],
      };
    }

    const parsedRegions = parseSamOutputToRegions(prediction?.output);
    const enrichedRegions = await enrichSamRegionsWithMaskedColors(imageUrl, parsedRegions);
    console.info("[SAM DEBUG] SAM segmentation succeeded", {
      regionCount: enrichedRegions.length,
      predictionId: prediction?.id || null,
    });

    return {
      enabled: true,
      ok: enrichedRegions.length > 0,
      reason: enrichedRegions.length ? null : "malformed_output",
      regions: enrichedRegions,
    };
  } catch (error) {
    console.error("[SAM DEBUG] SAM request error", error?.message || error);
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

  const sam = await runSamSegmentation(ghostUrl);

  return {
    dominantHex,
    dominantName: getColorName(dominantHex),
    topColors,
    segmentedRegions: sam?.ok ? sam.regions : [],
    pipeline: {
      sam_enabled: !!sam?.enabled,
      sam_ok: !!sam?.ok,
      sam_reason: sam?.reason || null,
      sam_version: REPLICATE_SAM_MODEL,
      fallback_mode: !sam?.ok,
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
    if (!analysis?.pipeline?.sam_ok) {
      const samReason = analysis?.pipeline?.sam_reason || "sam_failed";
      console.error("[SAM DEBUG] Failing /api/images/transform due to SAM failure", {
        reason: samReason,
        sam_enabled: !!analysis?.pipeline?.sam_enabled,
      });
      return res.status(502).json({
        success: false,
        step: "sam_segmentation",
        error: `SAM segmentation failed: ${samReason}`,
      });
    }

    let v2;
    let outfitAnalysis;
    try {
      v2 = generatePalettesV2(analysis.dominantHex);
      outfitAnalysis = buildOutfitAnalysis({
        dominantHex: analysis.dominantHex,
        topColors: analysis.topColors,
        segmentedRegions: analysis.segmentedRegions,
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
        selectedMode: normalizeModeLabel(mode || outfitAnalysis.best_mode),
        sourceItem: sourceItem || itemType || "piece",
        targetItem,
        industry: industry || "fashion",
        matchStrictness: matchStrictness || "medium",
        resultCount: resultCount || 24,
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
          pipeline: analysis.pipeline,
        });
      } catch (error) {
        return sendStepError(res, 500, "palette_engine", error);
      }
    }

    const retrievalIntent = buildRetrievalIntent(outfitAnalysis, {
      selectedMode: selectedMode || outfitAnalysis?.best_mode,
      sourceItem: sourceItem || "piece",
      targetItem: targetItem || "piece",
      industry: industry || "fashion",
      matchStrictness: matchStrictness || "medium",
      resultCount: resultCount || 24,
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
