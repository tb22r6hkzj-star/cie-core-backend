// src/server.js
// FULL REPLACEMENT — V2 COLOR ENGINE + GHOST PIPELINE (multer-hardened)
//
// ✅ POST /api/images/transform  (multipart -> Cloudinary -> Pixelcut -> Cloudinary colors -> V2 palettes)
// ✅ POST /api/recommendations   (ghostImageUrl -> Cloudinary colors -> V2 palettes)
// ✅ GET /, GET /health
// ✅ Dev-safe CORS
//
// HARDENING:
// ✅ upload.any() accepts ANY multipart file field name (image/file/etc)
// ✅ selects the first uploaded file safely
// ✅ Multer error middleware returns 400 with step=multer_parse instead of 500 crash
//
// REQUIRED Render env vars:
// - CLOUDINARY_CLOUD_NAME
// - CLOUDINARY_API_KEY
// - CLOUDINARY_API_SECRET
// - PIXELCUT_API_KEY
// - PIXELCUT_ENDPOINT  (e.g. https://api.developer.pixelcut.ai/v1/remove-background)

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
   (safe: express.json ignores multipart requests)
   ========================= */
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

/* =========================
   MULTER (HARDENED)
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
   V2 PALETTE ENGINE (mode-separated + tonal ladder)
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
      emphasis: {
        hexes: emphasis,
        reason: meta.vivid ? "Vivid base: controlled accents." : "Muted base: boosted saturation + energetic shift.",
      },
      natural: { hexes: natural, reason: "Earth blends via LAB mixing + muted toning." },
      explore: { hexes: explore, reason: "Triad + tetrad harmonies with tonal normalization." },
    },
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

// Multer-hardened upload → ghost → V2 palettes
app.post("/api/images/transform", upload.any(), async (req, res) => {
  const t0 = Date.now();
  try {
    // upload.any() puts files on req.files (array)
    const files = Array.isArray(req.files) ? req.files : [];
    const file = files[0];

    if (!file) {
      return res.status(400).json({
        success: false,
        step: "multer_parse",
        error: "No image uploaded (missing multipart file).",
      });
    }

    const tUploadStart = Date.now();
    const publicUrl = await uploadToCloudinary(file);
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
      summary:
        "Primary color detected. Use Balance/Contrast/Cohesion/Emphasis/Natural/Explore for structured, mode-specific directions.",
      timing: {
        upload_cloudinary_ms: tUpload,
        pixelcut_ms: tPixelcut,
        analyze_cloudinary_colors_ms: tAnalyze,
        palette_engine_ms: tPal,
        total_ms: totalMs,
      },
    });
  } catch (err) {
    console.error("transform error:", err?.message || err);
    return res.status(500).json({ success: false, error: err?.message || "Unknown error" });
  }
});

// Recommendations — mode palette from ghostImageUrl
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

    return res.json({
      success: true,
      engine: "V2",
      mode: key,
      itemType: itemType || null,
      dominantHex: v2.dominantHex,
      garmentColorFamily: v2.classification.family,
      colorLane: v2.classification.lane,
      recommendation: { paletteHexes: pack.hexes, reason: pack.reason },
    });
  } catch (err) {
    console.error("recommendations error:", err?.message || err);
    return res.status(500).json({ success: false, error: err?.message || "Unknown error" });
  }
});

/* =========================
   MULTER ERROR HANDLER (critical)
   ========================= */
app.use((err, _req, res, _next) => {
  // Multer errors (file too large, malformed multipart, etc.)
  if (err?.name === "MulterError") {
    return res.status(400).json({
      success: false,
      step: "multer_parse",
      error: err.message || "Upload failed: server could not parse your image.",
    });
  }
  // Busboy/multipart parse errors sometimes come through here
  if (String(err?.message || "").toLowerCase().includes("multipart")) {
    return res.status(400).json({
      success: false,
      step: "multer_parse",
      error: "Upload failed: malformed multipart request.",
    });
  }
  return res.status(500).json({ success: false, error: "Server error" });
});

/* =========================
   START
   ========================= */
app.listen(PORT, () => {
  console.log(`✅ CIE Core backend running on port ${PORT}`);
});