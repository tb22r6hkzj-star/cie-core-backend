// src/server.js
// FULL REPLACEMENT — V2 Palette Engine + V3 Structural Scoring Overlay (single-file backend)
//
// ✅ POST /api/images/transform  (upload -> Cloudinary -> Pixelcut -> Cloudinary colors -> V2 palettes + V3 scores)
// ✅ POST /api/recommendations   (ghostImageUrl -> colors -> V2 palette mode + V3 score for that mode)
// ✅ GET /, GET /health
//
// Upload hardening:
// ✅ upload.any() to accept any multipart field name (image/file/etc)
//
// REQUIRED Render env vars:
// - CLOUDINARY_CLOUD_NAME
// - CLOUDINARY_API_KEY
// - CLOUDINARY_API_SECRET
// - PIXELCUT_API_KEY
// - PIXELCUT_ENDPOINT (e.g. https://api.developer.pixelcut.ai/v1/remove-background)
//
// Deps:
// npm i express cors multer dotenv cloudinary chroma-js

import express from "express";
import cors from "cors";
import multer from "multer";
import dotenv from "dotenv";
import { v2 as cloudinary } from "cloudinary";
import chroma from "chroma-js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 10000;

app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-API-KEY"],
  })
);
app.options("*", cors());

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

/* =========================
   MULTER
   ========================= */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

/* =========================
   CLOUDINARY CONFIG
   ========================= */
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

/* =========================
   HEALTH
   ========================= */
app.get("/", (_req, res) => res.json({ ok: true, service: "cie-core-backend" }));
app.get("/health", (_req, res) => res.json({ ok: true }));

/* =========================
   UTILS
   ========================= */
function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

function safeHex(hex) {
  try {
    return chroma(hex).hex().toUpperCase();
  } catch {
    return null;
  }
}

function angleDist(a, b) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

function luminance01(hex) {
  // chroma luminance is already relative-ish but we’ll use WCAG style via RGB conversion
  const [r, g, b] = chroma(hex).rgb();
  const srgb = [r, g, b].map((v) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
}

function contrastRatio(L1, L2) {
  const a = Math.max(L1, L2);
  const b = Math.min(L1, L2);
  return (a + 0.05) / (b + 0.05);
}

function uniqHexes(arr) {
  const seen = new Set();
  const out = [];
  for (const h of arr) {
    const hx = safeHex(h);
    if (!hx) continue;
    if (seen.has(hx)) continue;
    seen.add(hx);
    out.push(hx);
  }
  return out;
}

function rotateHue(hex, deg) {
  const c = chroma(hex);
  const [h, s, l] = c.hsl();
  const hh = ((Number.isFinite(h) ? h : 0) + deg + 360) % 360;
  return chroma.hsl(hh, clamp01(s || 0), clamp01(l || 0)).hex().toUpperCase();
}

function setTone(hex, { sMul = 1, lAdd = 0 } = {}) {
  const c = chroma(hex);
  let [h, s, l] = c.hsl();
  h = Number.isFinite(h) ? h : 0;
  s = clamp01((s || 0) * sMul);
  l = clamp01((l || 0) + lAdd);
  return chroma.hsl(h, s, l).hex().toUpperCase();
}

/* =========================
   V2 CLASSIFICATION
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
  const light = l >= 0.72;

  return { family, lane, vivid, dark, light, h, s, l };
}

/* =========================
   V2 PALETTE ENGINE (already working)
   ========================= */
function generatePalettesV2(dominantHex) {
  const base = safeHex(dominantHex);
  if (!base) throw new Error("Invalid dominantHex");

  const meta = classifyColorV2(base);

  const balance = uniqHexes(["#111111", "#2B2B2B", "#7A7A7A", "#CFCFCF", "#F5F1E8"]);

  const comp = rotateHue(base, 180);
  const split1 = rotateHue(base, 150);
  const split2 = rotateHue(base, 210);
  const contrast = uniqHexes([
    setTone(comp, { sMul: 1.0, lAdd: meta.dark ? 0.25 : 0.05 }),
    setTone(split1, { sMul: 1.0, lAdd: meta.dark ? 0.25 : 0.05 }),
    setTone(split2, { sMul: 1.0, lAdd: meta.dark ? 0.25 : 0.05 }),
  ]);

  const cohesion = uniqHexes([
    setTone(base, { sMul: 0.85, lAdd: +0.18 }),
    setTone(base, { sMul: 0.75, lAdd: +0.08 }),
    setTone(base, { sMul: 1.0, lAdd: 0.0 }),
    setTone(base, { sMul: 0.9, lAdd: -0.10 }),
    setTone(base, { sMul: 0.8, lAdd: -0.18 }),
  ]);

  let emphasis;
  if (meta.vivid) {
    emphasis = uniqHexes([
      setTone(rotateHue(base, 200), { sMul: 0.85, lAdd: meta.dark ? 0.22 : 0.06 }),
      setTone(rotateHue(base, -200), { sMul: 0.85, lAdd: meta.dark ? 0.22 : 0.06 }),
      setTone(rotateHue(base, 120), { sMul: 0.8, lAdd: meta.dark ? 0.18 : 0.04 }),
    ]);
  } else {
    emphasis = uniqHexes([
      setTone(base, { sMul: 1.25, lAdd: 0.02 }),
      setTone(rotateHue(base, 150), { sMul: 1.1, lAdd: 0.06 }),
      setTone(rotateHue(base, 210), { sMul: 1.1, lAdd: 0.06 }),
    ]);
  }

  const natural = uniqHexes(
    [
      chroma.mix(base, "#556B2F", 0.55, "lab").hex().toUpperCase(),
      chroma.mix(base, "#8B4513", 0.50, "lab").hex().toUpperCase(),
      chroma.mix(base, "#B87333", 0.45, "lab").hex().toUpperCase(),
      chroma.mix(base, "#D2B48C", 0.55, "lab").hex().toUpperCase(),
      chroma.mix(base, "#2F5D50", 0.55, "lab").hex().toUpperCase(),
    ].map((h) => setTone(h, { sMul: 0.75, lAdd: meta.dark ? 0.18 : 0.0 }))
  );

  const tri1 = rotateHue(base, 120);
  const tri2 = rotateHue(base, 240);
  const tet1 = rotateHue(base, 90);
  const tet2 = rotateHue(base, 270);
  const explore = uniqHexes([
    setTone(tri1, { sMul: 0.95, lAdd: meta.dark ? 0.22 : 0.05 }),
    setTone(tri2, { sMul: 0.95, lAdd: meta.dark ? 0.22 : 0.05 }),
    setTone(tet1, { sMul: 0.9, lAdd: meta.dark ? 0.22 : 0.05 }),
    setTone(tet2, { sMul: 0.9, lAdd: meta.dark ? 0.22 : 0.05 }),
  ]);

  return {
    dominantHex: base,
    classification: {
      family: meta.family,
      lane: meta.lane,
      vivid: meta.vivid,
      h: Math.round(meta.h),
      s: Number(meta.s.toFixed(3)),
      l: Number(meta.l.toFixed(3)),
    },
    palettes: {
      balance: { hexes: balance, reason: "Neutral anchors for stability + broad compatibility." },
      contrast: { hexes: contrast, reason: "Complementary + split-complementary accents, tonally normalized." },
      cohesion: { hexes: cohesion, reason: "Same-hue tonal ladder (light → deep) for cohesive systems." },
      emphasis: { hexes: emphasis, reason: meta.vivid ? "Vivid base: controlled accents." : "Muted base: boosted accents." },
      natural: { hexes: natural, reason: "Earth blends via LAB mixing + muted toning." },
      explore: { hexes: explore, reason: "Triad + tetrad harmonies with tonal normalization." },
    },
  };
}

/* =========================
   V3 SCORING OVERLAY (DETERMINISTIC)
   ========================= */
function scorePaletteV3(modeName, hexes, dominantHex) {
  // role mapping (deterministic)
  const base = hexes[0];
  const secondary = hexes.slice(1, 3);
  const accent = hexes.slice(-2);

  const baseHSL = chroma(base).hsl();
  const baseHue = Number.isFinite(baseHSL[0]) ? baseHSL[0] : 0;

  const all = [base, ...secondary, ...accent].filter(Boolean);
  const hsls = all.map((h) => chroma(h).hsl());
  const hues = hsls.map((x) => (Number.isFinite(x[0]) ? x[0] : 0));
  const sats = hsls.map((x) => clamp01(x[1] || 0));
  const ls = hsls.map((x) => clamp01(x[2] || 0));

  // ---- Harmony components
  const bestFits = hues.slice(1).map((h) => {
    const d = angleDist(baseHue, h);
    const analogFit = clamp01(1 - d / 30);
    const complementFit = clamp01(1 - Math.abs(180 - d) / 30);
    const splitFit = clamp01(1 - Math.min(Math.abs(150 - d), Math.abs(210 - d)) / 30);
    const triadFit = clamp01(1 - Math.abs(120 - d) / 30);
    return Math.max(analogFit, complementFit, splitFit, triadFit);
  });
  const hueRelationshipFit = bestFits.length ? bestFits.reduce((a, b) => a + b, 0) / bestFits.length : 0.5;

  const rangeL = Math.max(...ls) - Math.min(...ls);
  const toneCohesion = clamp01(1 - rangeL / 0.75);

  const vividCount = sats.filter((s) => s >= 0.7).length;
  const saturationBalance = vividCount <= 1 ? 1 : vividCount === 2 ? 0.75 : 0.5;

  const warmCount = hues.filter((h) => h < 75 || h >= 345).length;
  const coolCount = hues.filter((h) => h >= 180 && h <= 300).length;
  const temperatureCoherence =
    (warmCount >= coolCount && coolCount <= 1) || (coolCount >= warmCount && warmCount <= 1) ? 1 : 0.7;

  const harmony01 =
    0.45 * hueRelationshipFit + 0.25 * toneCohesion + 0.2 * saturationBalance + 0.1 * temperatureCoherence;
  const harmony = Math.round(clamp01(harmony01) * 100);

  // ---- Applicability components
  const baseLum = luminance01(base);
  const accentLums = accent.map(luminance01);
  const bestRatio = accentLums.length ? Math.max(...accentLums.map((L) => contrastRatio(baseLum, L))) : 1.0;
  const contrastSafety = clamp01((bestRatio - 1) / 4); // ratio ~5 => 1.0

  const neutralExists = sats.some((s) => s < 0.2);
  const anchorPresence = neutralExists ? 1 : 0.65;

  const chromaModeration = vividCount <= 1 ? 1 : vividCount === 2 ? 0.75 : 0.55;

  let conflictPenalty = 1.0;
  // conflict: two vivid accents far apart
  const vividAccentHues = accent
    .map((h) => chroma(h).hsl())
    .filter((x) => clamp01(x[1] || 0) >= 0.7)
    .map((x) => (Number.isFinite(x[0]) ? x[0] : 0));
  if (vividAccentHues.length >= 2) {
    const d = angleDist(vividAccentHues[0], vividAccentHues[1]);
    conflictPenalty = d > 90 ? 0.55 : 0.75;
  }

  const applicability01 =
    0.4 * contrastSafety + 0.25 * anchorPresence + 0.2 * chromaModeration + 0.15 * conflictPenalty;
  const applicability = Math.round(clamp01(applicability01) * 100);

  // ---- Versatility components
  const neutralCount = sats.filter((s) => s < 0.2).length;
  const neutralSupport = neutralCount === 0 ? 0.55 : neutralCount === 1 ? 0.8 : 1.0;

  let toneRangeUsability = 0.75;
  if (rangeL < 0.2) toneRangeUsability = 0.65;
  else if (rangeL <= 0.55) toneRangeUsability = 1.0;
  else toneRangeUsability = 0.75;

  const overSpecificityPenalty = vividCount <= 1 ? 1.0 : vividCount === 2 ? 0.8 : 0.6;

  const versatility01 = 0.45 * neutralSupport + 0.35 * toneRangeUsability + 0.2 * overSpecificityPenalty;
  const versatility = Math.round(clamp01(versatility01) * 100);

  // ---- Boldness
  const avgSat = sats.reduce((a, b) => a + b, 0) / Math.max(1, sats.length);
  const hueSpread = hues.length > 1 ? hues.slice(1).map((h) => angleDist(baseHue, h) / 180).reduce((a, b) => a + b, 0) / (hues.length - 1) : 0.2;
  const contrastEnergy = clamp01((bestRatio - 1) / 6);
  const boldness01 = clamp01(0.5 * avgSat + 0.3 * hueSpread + 0.2 * contrastEnergy);
  const boldness = Math.round(boldness01 * 100);

  // ---- Composite (fixed deterministic weights)
  const composite01 = clamp01(0.35 * (harmony / 100) + 0.35 * (applicability / 100) + 0.2 * (versatility / 100) + 0.1 * (boldness / 100));
  const composite = Math.round(composite01 * 100);

  // Explanation (universal)
  const rules = [];
  if (neutralExists) rules.push("ANCHOR_PRESENT");
  if (vividCount <= 1) rules.push("LOW_VIVID_COUNT");
  if (bestRatio >= 3) rules.push("SAFE_CONTRAST");
  if (rangeL <= 0.55) rules.push("USABLE_TONE_RANGE");

  const user = (() => {
    if (composite >= 85) return "High-confidence direction with stable structure and strong real-world applicability.";
    if (composite >= 70) return "Solid direction with good balance between harmony and practical usability.";
    if (composite >= 55) return "Viable but more niche—use with intention and controlled accents.";
    return "Experimental direction—best for creative exploration rather than broad usability.";
  })();

  const pro = `hueFit=${hueRelationshipFit.toFixed(2)} rangeL=${rangeL.toFixed(2)} vividCount=${vividCount} contrastRatio=${bestRatio.toFixed(2)} neutralCount=${neutralCount}`;

  return {
    mode: modeName,
    scores: { harmony, applicability, versatility, boldness, composite },
    explanation: {
      user,
      pro,
      weights: { harmony: 0.35, applicability: 0.35, versatility: 0.2, boldness: 0.1 },
      rules,
    },
  };
}

function buildV3FromV2(v2) {
  const modeScores = {};
  const explanations = {};
  const rankings = [];

  for (const mode of ["balance", "contrast", "cohesion", "emphasis", "natural", "explore"]) {
    const hexes = v2.palettes?.[mode]?.hexes || [];
    const scored = scorePaletteV3(mode, hexes, v2.dominantHex);
    modeScores[mode] = scored.scores;
    explanations[mode] = scored.explanation;
    rankings.push({ mode, composite: scored.scores.composite });
  }

  rankings.sort((a, b) => b.composite - a.composite);

  return {
    context: {
      dominantHex: v2.dominantHex,
      ...v2.classification,
      paletteCountPerMode: Object.fromEntries(
        Object.entries(v2.palettes).map(([k, v]) => [k, (v.hexes || []).length])
      ),
    },
    modeScores,
    rankings,
    explanations,
  };
}

/* =========================
   IMAGE OPS: Cloudinary + Pixelcut
   ========================= */
async function uploadToCloudinary(file) {
  const dataUri = `data:${file.mimetype};base64,${Buffer.from(file.buffer).toString("base64")}`;
  const result = await cloudinary.uploader.upload(dataUri, {
    folder: "cie",
    resource_type: "image",
  });
  if (!result?.secure_url) throw new Error("Cloudinary upload failed (no secure_url)");
  return result.secure_url;
}

async function callPixelcutRemoveBg(imageUrl) {
  const apiKey = process.env.PIXELCUT_API_KEY;
  const endpoint = process.env.PIXELCUT_ENDPOINT;
  if (!apiKey || !endpoint) throw new Error("Missing Pixelcut env vars");

  const resp = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-KEY": apiKey,
      Accept: "application/json",
    },
    body: JSON.stringify({ image_url: imageUrl, format: "png" }),
  });

  const text = await resp.text();
  if (!resp.ok) throw new Error(`Pixelcut failed: ${resp.status} ${text}`);

  const data = JSON.parse(text);
  if (!data?.result_url) throw new Error("Pixelcut response missing result_url");
  return data.result_url;
}

async function analyzeGhostColors(ghostUrl) {
  const res = await cloudinary.uploader.upload(ghostUrl, {
    folder: "cie/ghost",
    resource_type: "image",
    colors: true,
  });

  const colors = Array.isArray(res.colors) ? res.colors : [];
  if (!colors.length) throw new Error("Color analysis failed (no colors returned)");

  const dominantHex = safeHex(String(colors[0][0])) || "#000000";
  const topColors = colors
    .slice(0, 8)
    .map(([hex, pct]) => ({ hex: safeHex(hex) || "#000000", pct }))
    .filter((x) => !!x.hex);

  return { dominantHex, topColors };
}

/* =========================
   ROUTES
   ========================= */
app.post("/api/images/transform", upload.any(), async (req, res) => {
  try {
    const file = req.files?.[0];
    if (!file) return res.status(400).json({ success: false, error: "No image file received" });

    const publicUrl = await uploadToCloudinary(file);
    const ghostUrl = await callPixelcutRemoveBg(publicUrl);
    const analysis = await analyzeGhostColors(ghostUrl);

    const v2 = generatePalettesV2(analysis.dominantHex);
    const v3 = buildV3FromV2(v2);

    return res.json({
      success: true,
      engine: "V2",
      v3Engine: "V3.0",
      ghostImageUrl: ghostUrl,
      dominantHex: v2.dominantHex,
      garmentColorFamily: v2.classification.family,
      colorLane: v2.classification.lane,
      classification: v2.classification,
      topColors: analysis.topColors,
      palettes: v2.palettes,
      v3,
      summary: "V2 palettes generated. V3 scoring ranks each mode with Harmony/Applicability/Versatility/Boldness.",
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err?.message || "Unknown error" });
  }
});

app.post("/api/recommendations", async (req, res) => {
  try {
    const { ghostImageUrl, mode } = req.body || {};
    if (!ghostImageUrl) return res.status(400).json({ success: false, error: "ghostImageUrl is required" });

    const analysis = await analyzeGhostColors(ghostImageUrl);
    const v2 = generatePalettesV2(analysis.dominantHex);
    const v3 = buildV3FromV2(v2);

    const m = String(mode || "balance").toLowerCase().trim();
    const key = ["balance","contrast","cohesion","emphasis","natural","explore"].includes(m) ? m : "balance";

    return res.json({
      success: true,
      engine: "V2",
      v3Engine: "V3.0",
      mode: key,
      dominantHex: v2.dominantHex,
      classification: v2.classification,
      recommendation: {
        paletteHexes: v2.palettes[key].hexes,
        reason: v2.palettes[key].reason,
      },
      v3: {
        scores: v3.modeScores[key],
        explanation: v3.explanations[key],
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err?.message || "Unknown error" });
  }
});

app.listen(PORT, () => console.log(`✅ CIE Core backend running on port ${PORT}`));