// src/server.js
// FULL REPLACEMENT — V2 COLOR ENGINE + GHOST PIPELINE + V3 SCI SCORING (single-file backend)
//
// ✅ POST /api/images/transform  (upload -> Cloudinary -> Pixelcut remove-bg -> Cloudinary color analysis -> V2 palettes -> V3 scoring)
// ✅ POST /api/recommendations   (takes ghostImageUrl + mode -> returns selected mode palette + V3 scores for that mode)
// ✅ GET /health, GET /
// ✅ CORS dev-safe for Famous previews + custom domains
//
// REQUIRED Render env vars:
// - CLOUDINARY_CLOUD_NAME
// - CLOUDINARY_API_KEY
// - CLOUDINARY_API_SECRET
// - PIXELCUT_API_KEY
// - PIXELCUT_ENDPOINT   (e.g. https://api.developer.pixelcut.ai/v1/remove-background)
//
// Deps:
// npm i express cors multer dotenv cloudinary chroma-js
//
// Notes:
// - V2 palettes are MODE-SEPARATED and TONALLY EXPANDED
// - V3 scoring is UNIVERSAL (fashion + interiors): Harmony / Applicability / Versatility / Boldness
// - Output is deterministic.

import express from "express";
import cors from "cors";
import multer from "multer";
import dotenv from "dotenv";
import { v2 as cloudinary } from "cloudinary";
import chroma from "chroma-js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 10000;

/* =========================
   CORS (DEV / PREVIEW SAFE)
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
   UPLOAD (Multer)
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
   HELPERS
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

/* =========================
   COLOR FAMILY (V2 TAXONOMY)
   ========================= */
function classifyColorV2(dominantHex) {
  const c = chroma(dominantHex);
  const [hRaw, sRaw, lRaw] = c.hsl();
  const h = Number.isFinite(hRaw) ? hRaw : 0;
  const s = clamp01(sRaw || 0);
  const l = clamp01(lRaw || 0);

  // broad family
  let family = "neutral";
  if (s < 0.12) family = "neutral";
  else if (l > 0.78 && s < 0.35) family = "pastel";
  else {
    const earthHue = (h >= 15 && h <= 65) || (h >= 80 && h <= 165);
    if (earthHue && s <= 0.6 && l >= 0.22 && l <= 0.78) family = "earth";
    else if (s >= 0.55) family = "bold";
    else family = "neutral";
  }

  // hue lane
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
   V2 PALETTE ENGINE
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
      balance: {
        hexes: balance,
        reason: "Neutral anchors (low-saturation + high-compatibility) for stability and broad applicability.",
      },
      contrast: {
        hexes: contrast,
        reason: "Complementary + split-complementary accents (H+180, H±150/210) tonally normalized for usability.",
      },
      cohesion: {
        hexes: cohesion,
        reason: "Same-hue tonal ladder (light → deep) for cohesive systems across fashion and interiors.",
      },
      emphasis: {
        hexes: emphasis,
        reason: meta.vivid
          ? "Vivid base detected: emphasis uses controlled accents (muted saturation + safe luminance shifts)."
          : "Muted base detected: emphasis boosts saturation + introduces a high-energy hue shift.",
      },
      natural: {
        hexes: natural,
        reason: "Earth blends (olive/tan/clay/copper) via LAB mixing + muted toning for grounded styling.",
      },
      explore: {
        hexes: explore,
        reason: "Exploratory harmonies (triad + tetrad) with tonal normalization for broader valid directions.",
      },
    },
  };
}

/* =========================================================
   V3 — Structural Color Intelligence (SCI) Scoring Layer
   Scores each V2 mode with Harmony / Applicability / Versatility / Boldness
   ========================================================= */
function clamp(x, a, b) {
  return Math.max(a, Math.min(b, x));
}
function hexToRgb01(hex) {
  const c = chroma(hex).rgb();
  return { r: c[0] / 255, g: c[1] / 255, b: c[2] / 255 };
}
function relLuminance(hex) {
  const { r, g, b } = hexToRgb01(hex);
  const f = (u) => (u <= 0.03928 ? u / 12.92 : Math.pow((u + 0.055) / 1.055, 2.4));
  const R = f(r),
    G = f(g),
    B = f(b);
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}
function contrastRatio(hexA, hexB) {
  const L1 = relLuminance(hexA);
  const L2 = relLuminance(hexB);
  const lighter = Math.max(L1, L2);
  const darker = Math.min(L1, L2);
  return (lighter + 0.05) / (darker + 0.05);
}
function hueDeg(hex) {
  const [h] = chroma(hex).hsl();
  return Number.isFinite(h) ? h : 0;
}
function sat(hex) {
  const [, s] = chroma(hex).hsl();
  return clamp01(s || 0);
}
function light(hex) {
  const [, , l] = chroma(hex).hsl();
  return clamp01(l || 0);
}
function hueDistance(a, b) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}
function closenessToAngle(hDist, target, tolerance) {
  const delta = Math.abs(hDist - target);
  return clamp01(1 - delta / tolerance);
}
function avg(arr) {
  if (!arr.length) return 0;
  return arr.reduce((s, x) => s + x, 0) / arr.length;
}

function scoreModeV3({ modeKey, dominantHex, hexes }) {
  const base = chroma(dominantHex).hex().toUpperCase();
  const palette = hexes.map((h) => chroma(h).hex().toUpperCase());

  const baseHue = hueDeg(base);

  const contrasts = palette.map((h) => contrastRatio(base, h)); // 1..21
  const hueDists = palette.map((h) => hueDistance(baseHue, hueDeg(h))); // 0..180
  const sats = palette.map((h) => sat(h));
  const lights = palette.map((h) => light(h));

  const avgContrast = avg(contrasts);
  const maxContrast = Math.max(...contrasts, 0);
  const avgHueDist = avg(hueDists);
  const satMean = avg(sats);
  const satVar = avg(sats.map((s) => Math.abs(s - satMean)));
  const lightMean = avg(lights);
  const lightVar = avg(lights.map((l) => Math.abs(l - lightMean)));

  const neutralCount = palette.filter((h) => sat(h) < 0.12).length;
  const safeLightCount = palette.filter((h) => {
    const l = light(h);
    return l >= 0.18 && l <= 0.86;
  }).length;

  const compCloseness = avg(hueDists.map((d) => closenessToAngle(d, 180, 35)));
  const splitCloseness = avg(
    hueDists.map((d) => Math.max(closenessToAngle(d, 150, 25), closenessToAngle(d, 210, 25)))
  );
  const analogCloseness = avg(hueDists.map((d) => closenessToAngle(d, 30, 25)));
  const triadCloseness = avg(hueDists.map((d) => closenessToAngle(d, 120, 30)));

  const contrastBandScore = (() => {
    const ideal = 4.5;
    const delta = Math.abs(avgContrast - ideal);
    return clamp(100 - delta * 18, 0, 100);
  })();
  const satStabilityScore = clamp(100 - satVar * 180, 0, 100);
  const lightStabilityScore = clamp(100 - lightVar * 160, 0, 100);

  let relBonus = 0;
  if (modeKey === "contrast") relBonus = 25 * clamp01(0.6 * compCloseness + 0.4 * splitCloseness);
  if (modeKey === "cohesion") relBonus = 25 * clamp01(analogCloseness + (1 - avgHueDist / 180));
  if (modeKey === "explore")
    relBonus = 25 * clamp01(0.5 * triadCloseness + 0.25 * compCloseness + 0.25 * splitCloseness);
  if (modeKey === "balance") relBonus = 25 * clamp01(neutralCount / Math.max(1, palette.length));
  if (modeKey === "natural")
    relBonus =
      25 * clamp01((neutralCount * 0.6 + safeLightCount * 0.4) / Math.max(1, palette.length));
  if (modeKey === "emphasis") relBonus = 25 * clamp01(maxContrast / 10);

  const harmony = clamp(
    0.45 * contrastBandScore + 0.25 * satStabilityScore + 0.2 * lightStabilityScore + relBonus,
    0,
    100
  );

  const neutralScore = clamp((neutralCount / Math.max(1, palette.length)) * 100, 0, 100);
  const safeLightScore = clamp((safeLightCount / Math.max(1, palette.length)) * 100, 0, 100);

  const satPenalty = (() => {
    const highSatCount = palette.filter((h) => sat(h) > 0.75).length;
    const ratio = highSatCount / Math.max(1, palette.length);
    const multiplier = modeKey === "emphasis" || modeKey === "explore" ? 0.55 : 1.0;
    return ratio * 45 * multiplier;
  })();

  const applicability = clamp(0.45 * safeLightScore + 0.35 * neutralScore + 0.2 * harmony - satPenalty, 0, 100);

  const hueSpreadScore = clamp((avgHueDist / 180) * 100, 0, 100);
  const usableContrastScore = clamp((avgContrast / 7) * 100, 0, 100);
  const notChaoticScore = clamp(100 - (satVar * 160 + lightVar * 120), 0, 100);

  const versatility = clamp(
    0.3 * neutralScore + 0.25 * usableContrastScore + 0.25 * notChaoticScore + 0.2 * hueSpreadScore,
    0,
    100
  );

  const boldness = clamp(
    0.45 * clamp((maxContrast / 10) * 100, 0, 100) +
      0.35 * clamp(satMean * 100, 0, 100) +
      0.2 * clamp((avgHueDist / 180) * 100, 0, 100),
    0,
    100
  );

  const weights = { harmony: 0.34, applicability: 0.28, versatility: 0.24, boldness: 0.14 };
  const total =
    harmony * weights.harmony +
    applicability * weights.applicability +
    versatility * weights.versatility +
    boldness * weights.boldness;

  return {
    mode: modeKey,
    scores: {
      harmony: Math.round(harmony),
      applicability: Math.round(applicability),
      versatility: Math.round(versatility),
      boldness: Math.round(boldness),
    },
    weightedScore: Number(total.toFixed(2)),
    explanation: {
      harmony: `Contrast band=${avgContrast.toFixed(2)} (ideal ~4.5), satVar=${satVar.toFixed(
        2
      )}, lightVar=${lightVar.toFixed(2)}.`,
      applicability: `Neutral anchors=${neutralCount}/${palette.length}, safeLight=${safeLightCount}/${palette.length}, satPenalty=${satPenalty.toFixed(
        1
      )}.`,
      versatility: `HueSpread(avgDist)=${avgHueDist.toFixed(
        1
      )}°, avgContrast=${avgContrast.toFixed(2)}, stability=${notChaoticScore.toFixed(0)}.`,
      boldness: `MaxContrast=${maxContrast.toFixed(2)}, satMean=${satMean.toFixed(
        2
      )}, avgHueDist=${avgHueDist.toFixed(1)}°.`,
    },
    debug: {
      avgContrast: Number(avgContrast.toFixed(2)),
      maxContrast: Number(maxContrast.toFixed(2)),
      neutralCount,
      safeLightCount,
      satMean: Number(satMean.toFixed(2)),
      satVar: Number(satVar.toFixed(2)),
      lightMean: Number(lightMean.toFixed(2)),
      lightVar: Number(lightVar.toFixed(2)),
      avgHueDist: Number(avgHueDist.toFixed(1)),
    },
  };
}

function scorePalettesV3({ dominantHex, palettes }) {
  const modeKeys = ["balance", "contrast", "cohesion", "emphasis", "natural", "explore"];

  const scored = modeKeys
    .filter((k) => palettes?.[k]?.hexes?.length)
    .map((k) => scoreModeV3({ modeKey: k, dominantHex, hexes: palettes[k].hexes }))
    .sort((a, b) => b.weightedScore - a.weightedScore);

  return {
    bestMode: scored[0]?.mode || null,
    rankedModes: scored,
    weightsUsed: { harmony: 0.34, applicability: 0.28, versatility: 0.24, boldness: 0.14 },
  };
}

/* =========================
   IMAGE OPS: Cloudinary + Pixelcut
   ========================= */
async function uploadToCloudinary(file) {
  const dataUri = `data:${file.mimetype};base64,${file.buffer.toString("base64")}`;
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

  if (!apiKey || !endpoint) throw new Error("Missing Pixelcut env vars (PIXELCUT_API_KEY / PIXELCUT_ENDPOINT)");

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

// Upload → ghost → V2 palettes → V3 scoring
app.post("/api/images/transform", upload.single("image"), async (req, res) => {
  const t0 = Date.now();
  try {
    if (!req.file) return res.status(400).json({ success: false, step: "multer", error: "No image uploaded" });

    const tUploadStart = Date.now();
    const publicUrl = await uploadToCloudinary(req.file);
    const tUpload = Date.now() - tUploadStart;

    const tPixelcutStart = Date.now();
    const ghostUrl = await callPixelcutRemoveBg(publicUrl);
    const tPixelcut = Date.now() - tPixelcutStart;

    const tAnalyzeStart = Date.now();
    const analysis = await analyzeGhostColors(ghostUrl);
    const tAnalyze = Date.now() - tAnalyzeStart;

    const tPalStart = Date.now();
    const v2 = generatePalettesV2(analysis.dominantHex);
    const tPal = Date.now() - tPalStart;

    const tScoreStart = Date.now();
    const v3 = scorePalettesV3({ dominantHex: v2.dominantHex, palettes: v2.palettes });
    const tScore = Date.now() - tScoreStart;

    const totalMs = Date.now() - t0;

    return res.json({
      success: true,
      engine: "V2",
      ghostImageUrl: ghostUrl,
      dominantHex: v2.dominantHex,
      garmentColorFamily: v2.classification.family,
      colorLane: v2.classification.lane,
      classification: v2.classification,
      topColors: analysis.topColors,
      palettes: v2.palettes,
      v3: {
        bestMode: v3.bestMode,
        rankedModes: v3.rankedModes,
        weightsUsed: v3.weightsUsed,
      },
      summary:
        "V2 palettes generated. V3 scores rank each mode with Harmony/Applicability/Versatility/Boldness for a universal intelligence layer.",
      timing: {
        upload_cloudinary_ms: tUpload,
        pixelcut_ms: tPixelcut,
        analyze_cloudinary_colors_ms: tAnalyze,
        palette_engine_ms: tPal,
        v3_scoring_ms: tScore,
        total_ms: totalMs,
      },
    });
  } catch (err) {
    const msg = err?.message || String(err);
    console.error("transform error:", msg);

    // Step hints for the frontend (optional but useful)
    let step = "unknown";
    if (msg.toLowerCase().includes("pixelcut")) step = "pixelcut";
    else if (msg.toLowerCase().includes("cloudinary upload")) step = "cloudinary_upload";
    else if (msg.toLowerCase().includes("color analysis")) step = "cloudinary_colors";
    else if (msg.toLowerCase().includes("dominanthex")) step = "palette_engine";

    return res.status(500).json({ success: false, step, error: msg });
  }
});

// Recommendations — return one mode palette + that mode's V3 score object
app.post("/api/recommendations", async (req, res) => {
  try {
    const { ghostImageUrl, mode, itemType } = req.body || {};
    if (!ghostImageUrl) return res.status(400).json({ success: false, error: "ghostImageUrl is required" });

    const analysis = await analyzeGhostColors(ghostImageUrl);
    const v2 = generatePalettesV2(analysis.dominantHex);

    const m = String(mode || "").toLowerCase().trim();
    const map = {
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
    const key = map[m] || "balance";
    const pack = v2.palettes[key];

    const v3 = scorePalettesV3({ dominantHex: v2.dominantHex, palettes: v2.palettes });
    const scoreForMode = v3.rankedModes.find((x) => x.mode === key) || null;

    return res.json({
      success: true,
      engine: "V2",
      mode: key,
      itemType: itemType || null,
      dominantHex: v2.dominantHex,
      garmentColorFamily: v2.classification.family,
      colorLane: v2.classification.lane,
      recommendation: {
        paletteHexes: pack.hexes,
        reason: pack.reason,
      },
      v3: {
        bestMode: v3.bestMode,
        scoreForMode,
        weightsUsed: v3.weightsUsed,
      },
    });
  } catch (err) {
    const msg = err?.message || String(err);
    console.error("recommendations error:", msg);
    return res.status(500).json({ success: false, error: msg });
  }
});

/* =========================
   START
   ========================= */
app.listen(PORT, () => {
  console.log(`✅ CIE Core backend running on port ${PORT}`);
});