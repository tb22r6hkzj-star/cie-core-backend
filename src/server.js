// src/server.js — FULL REPLACEMENT (fixes upload field + Cloudinary config)
// - Accepts multipart field name "file" (common) and "image" (legacy)
// - Uses CLOUDINARY_URL if present (preferred)
// - Adds /ready endpoint to confirm env presence (booleans only)
// - Adds basic step timing logs for /api/images/transform

import express from "express";
import cors from "cors";
import multer from "multer";
import dotenv from "dotenv";
import { v2 as cloudinary } from "cloudinary";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 10000;

/* =========================
   CORS (DEV SAFE)
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
   =========================
   Prefer CLOUDINARY_URL. If not present, fall back to individual vars.
*/
if (process.env.CLOUDINARY_URL) {
  cloudinary.config({ secure: true });
} else {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  });
}

/* =========================
   HEALTH + READY
   ========================= */
app.get("/", (_req, res) => res.json({ ok: true, service: "cie-core-backend" }));
app.get("/health", (_req, res) => res.json({ ok: true }));

app.get("/ready", (_req, res) => {
  res.json({
    ok: true,
    env: {
      CLOUDINARY_URL: !!process.env.CLOUDINARY_URL,
      CLOUDINARY_CLOUD_NAME: !!process.env.CLOUDINARY_CLOUD_NAME,
      CLOUDINARY_API_KEY: !!process.env.CLOUDINARY_API_KEY,
      CLOUDINARY_API_SECRET: !!process.env.CLOUDINARY_API_SECRET,
      PIXELCUT_API_KEY: !!process.env.PIXELCUT_API_KEY,
      PIXELCUT_ENDPOINT: !!process.env.PIXELCUT_ENDPOINT,
    },
  });
});

/* =========================
   COLOR HELPERS
   ========================= */
function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

function hexToRgb(hex) {
  const h = String(hex).replace("#", "").trim();
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const int = parseInt(full, 16);
  return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
}

function rgbToHex({ r, g, b }) {
  const toHex = (v) => v.toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

function rgbToHsl({ r, g, b }) {
  const rn = r / 255,
    gn = g / 255,
    bn = b / 255;

  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;

  let h = 0;
  if (delta !== 0) {
    if (max === rn) h = ((gn - bn) / delta) % 6;
    else if (max === gn) h = (bn - rn) / delta + 2;
    else h = (rn - gn) / delta + 4;
    h = Math.round(h * 60);
    if (h < 0) h += 360;
  }

  const l = (max + min) / 2;
  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));
  return { h, s: clamp01(s), l: clamp01(l) };
}

function classifyFamilyFromHsl({ h, s, l }) {
  if (s < 0.12) return "neutrals";
  if (l > 0.75 && s < 0.35) return "pastels";

  const earthHue = (h >= 15 && h <= 60) || (h >= 70 && h <= 165);
  if (earthHue && s <= 0.55 && l >= 0.25 && l <= 0.75) return "earth-tones";

  if (s >= 0.55) return "bold-colors";

  if (h >= 345 || h < 15) return "reds";
  if (h >= 15 && h < 45) return "oranges";
  if (h >= 45 && h < 75) return "yellows";
  if (h >= 75 && h < 165) return "greens";
  if (h >= 165 && h < 210) return "cyans";
  if (h >= 210 && h < 255) return "blues";
  if (h >= 255 && h < 315) return "purples";
  if (h >= 315 && h < 345) return "pinks";
  return "all-colors";
}

function buildPalettes(dominantHex) {
  const hsl = rgbToHsl(hexToRgb(dominantHex));
  const H = hsl.h;

  const complementaryHue = (H + 180) % 360;
  const complementaryHex = rgbToHex(
    (() => {
      // reuse hsl, same sat/light
      const { s, l } = hsl;
      // hsl->rgb
      const C = (1 - Math.abs(2 * l - 1)) * s;
      const X = C * (1 - Math.abs(((complementaryHue / 60) % 2) - 1));
      const m = l - C / 2;
      let r1 = 0,
        g1 = 0,
        b1 = 0;
      if (0 <= complementaryHue && complementaryHue < 60) [r1, g1, b1] = [C, X, 0];
      else if (60 <= complementaryHue && complementaryHue < 120) [r1, g1, b1] = [X, C, 0];
      else if (120 <= complementaryHue && complementaryHue < 180) [r1, g1, b1] = [0, C, X];
      else if (180 <= complementaryHue && complementaryHue < 240) [r1, g1, b1] = [0, X, C];
      else if (240 <= complementaryHue && complementaryHue < 300) [r1, g1, b1] = [X, 0, C];
      else [r1, g1, b1] = [C, 0, X];
      return { r: Math.round((r1 + m) * 255), g: Math.round((g1 + m) * 255), b: Math.round((b1 + m) * 255) };
    })()
  ).toUpperCase();

  const neutrals = ["#111111", "#2B2B2B", "#7A7A7A", "#CFCFCF", "#F5F1E8"];

  return {
    dominant: { hex: dominantHex.toUpperCase(), reason: "Dominant HEX extracted from ghost image pixels." },
    neutrals: { hexes: neutrals, reason: "Neutral anchors (low-saturation) for compatibility." },
    complementary: { hex: complementaryHex, reason: "Complementary computed as H+180 (mod 360)." },
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
  if (!process.env.PIXELCUT_API_KEY || !process.env.PIXELCUT_ENDPOINT) {
    throw new Error("Missing Pixelcut env vars");
  }

  // give Pixelcut time
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000); // 45s

  try {
    const resp = await fetch(process.env.PIXELCUT_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-KEY": process.env.PIXELCUT_API_KEY,
        Accept: "application/json",
      },
      body: JSON.stringify({ image_url: imageUrl, format: "png" }),
      signal: controller.signal,
    });

    const text = await resp.text();
    if (!resp.ok) throw new Error(`Pixelcut failed: ${resp.status} ${text}`);

    const data = JSON.parse(text);
    return data.result_url;
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
  if (!colors.length) throw new Error("Color analysis failed (no colors returned)");

  const dominantHex = String(colors[0][0]).toUpperCase();
  const hsl = rgbToHsl(hexToRgb(dominantHex));
  const family = classifyFamilyFromHsl(hsl);

  return { dominantHex, family };
}

/* =========================
   ROUTES
   ========================= */

// IMPORTANT: Accept "file" (frontend) AND "image" (legacy).
// This prevents req.file being undefined due to field mismatch.
app.post(
  "/api/images/transform",
  upload.fields([
    { name: "file", maxCount: 1 },
    { name: "image", maxCount: 1 },
  ]),
  async (req, res) => {
    const t0 = Date.now();
    try {
      const file = (req.files?.file && req.files.file[0]) || (req.files?.image && req.files.image[0]);
      if (!file) return res.status(400).json({ success: false, error: "No image uploaded (expected field 'file' or 'image')" });

      console.log("[TRANSFORM] start");

      const t1 = Date.now();
      const publicUrl = await uploadToCloudinary(file);
      console.log("[TRANSFORM] cloudinary_upload_ms", Date.now() - t1);

      const t2 = Date.now();
      const ghostUrl = await callPixelcutRemoveBg(publicUrl);
      console.log("[TRANSFORM] pixelcut_ms", Date.now() - t2);

      const t3 = Date.now();
      const analysis = await analyzeGhostColors(ghostUrl);
      console.log("[TRANSFORM] analyze_ms", Date.now() - t3);

      const palettes = buildPalettes(analysis.dominantHex);

      console.log("[TRANSFORM] total_ms", Date.now() - t0);

      return res.json({
        success: true,
        ghostImageUrl: ghostUrl,
        garmentColorFamily: analysis.family,
        summary: "Primary color detected. Use recommendations below for balanced, contrast, cohesive, emphasis, natural, or explore directions.",
        dominantHex: analysis.dominantHex,
        palettes,
      });
    } catch (err) {
      console.error("[TRANSFORM] error", err?.message || err);
      return res.status(500).json({ success: false, error: err?.message || "Unknown error" });
    }
  }
);

app.post("/api/recommendations", async (req, res) => {
  try {
    const { ghostImageUrl, mode } = req.body || {};
    if (!ghostImageUrl) return res.status(400).json({ success: false, error: "ghostImageUrl is required" });

    const analysis = await analyzeGhostColors(ghostImageUrl);
    const palettes = buildPalettes(analysis.dominantHex);

    const m = String(mode || "").toLowerCase();
    const paletteHexes = m.includes("neutral") ? palettes.neutrals.hexes : [palettes.complementary.hex];

    return res.json({
      success: true,
      dominantHex: analysis.dominantHex,
      garmentColorFamily: analysis.family,
      recommendation: { paletteHexes, reason: "Generated from extracted dominant color using deterministic palette logic." },
    });
  } catch (err) {
    console.error("recommendations error:", err?.message || err);
    return res.status(500).json({ success: false, error: err?.message || "Unknown error" });
  }
});

app.listen(PORT, () => {
  console.log(`✅ CIE Core backend running on port ${PORT}`);
});