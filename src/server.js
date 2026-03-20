// src/server.js
// FULL REWRITE — VisionCore backend (PREMIUM NAMING + FULL COVERAGE)

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
   CORE SETUP
========================= */
app.use(cors({ origin: "*", methods: ["GET", "POST"] }));
app.use(express.json({ limit: "10mb" }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

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

/* =========================
   PREMIUM COLOR NAMING
========================= */
function getColorName(hex) {
  const h = getHue(hex);
  const s = getSat(hex);
  const l = getLight(hex);

  // NEUTRALS
  if (s < 0.06 && l < 0.12) return "Jet Black";
  if (s < 0.08 && l < 0.25) return "Graphite Black";
  if (s < 0.1 && l < 0.4) return "Charcoal Slate";
  if (s < 0.12 && l < 0.6) return "Stone Gray";
  if (s < 0.15 && l < 0.8) return "Ash Gray";
  if (l > 0.9) return "Soft White";
  if (l > 0.8) return "Linen White";

  // REDS
  if (h < 10 || h > 350) return l < 0.5 ? "Deep Crimson" : "Soft Rose";

  // ORANGE / BROWN
  if (h >= 10 && h < 35) return l < 0.5 ? "Burnt Umber" : "Warm Sand";
  if (h >= 35 && h < 50) return "Golden Amber";

  // YELLOW
  if (h >= 50 && h < 70) return "Muted Gold";

  // GREEN
  if (h >= 70 && h < 140) return l < 0.5 ? "Forest Green" : "Soft Sage";

  // TEAL
  if (h >= 140 && h < 180) return "Deep Teal";

  // BLUE
  if (h >= 180 && h < 250) return l < 0.5 ? "Midnight Navy" : "Steel Blue";

  // PURPLE
  if (h >= 250 && h < 300) return "Royal Plum";

  // PINK
  if (h >= 300 && h < 350) return "Muted Rose";

  return "Refined Neutral";
}

function buildNamedHex(hex) {
  const safe = safeHex(hex);
  return safe
    ? {
        hex: safe,
        name: getColorName(safe),
      }
    : null;
}

function buildNamedHexes(arr) {
  return arr.map(buildNamedHex).filter(Boolean);
}

/* =========================
   COLOR ENGINE
========================= */
function classifyColor(hex) {
  const h = getHue(hex);
  const s = getSat(hex);
  const l = getLight(hex);

  if (s < 0.12) return "neutral";
  if (h >= 70 && h < 160) return "earth";
  if (s > 0.6) return "bold";
  return "balanced";
}

function generatePalettes(dominantHex) {
  const base = safeHex(dominantHex);

  const balance = ["#111111", "#444444", "#888888", "#CCCCCC"];
  const contrast = [
    chroma(base).set("hsl.h", (getHue(base) + 180) % 360).hex(),
  ];

  return {
    balance: {
      named_hexes: buildNamedHexes(balance),
    },
    contrast: {
      named_hexes: buildNamedHexes(contrast),
    },
  };
}

/* =========================
   OUTFIT ANALYSIS
========================= */
function buildOutfitAnalysis(dominantHex) {
  const base = safeHex(dominantHex);

  const colors = [base];
  const roles = colors.map((hex, i) => ({
    hex,
    name: getColorName(hex),
    role: i === 0 ? "anchor" : "support",
  }));

  return {
    outfit_score: 85,
    best_mode: "Balance",
    color_roles: roles,
    detected_palette: {
      primary: colors,
      secondary: [],
      accent: [],
      named: {
        primary: buildNamedHexes(colors),
        secondary: [],
        accent: [],
      },
    },
    style_identity: {
      label: "Modern Classic",
    },
    why_this_works: `The ${roles[0].name} anchor establishes structure.`,
    suggested_adjustment: `This look performs best in Balance mode. Slight refinement would improve equilibrium.`,
  };
}

/* =========================
   IMAGE PIPELINE
========================= */
async function uploadToCloudinary(file) {
  const dataUri = `data:${file.mimetype};base64,${file.buffer.toString(
    "base64"
  )}`;
  const result = await cloudinary.uploader.upload(dataUri);
  return result.secure_url;
}

async function analyzeColors(imageUrl) {
  const res = await cloudinary.uploader.upload(imageUrl, {
    colors: true,
  });

  const dominantHex = safeHex(res.colors[0][0]);

  return {
    dominantHex,
  };
}

/* =========================
   ROUTES
========================= */
app.post("/api/images/transform", upload.any(), async (req, res) => {
  try {
    const file = req.files[0];

    const url = await uploadToCloudinary(file);
    const analysis = await analyzeColors(url);

    const palettes = generatePalettes(analysis.dominantHex);
    const outfit = buildOutfitAnalysis(analysis.dominantHex);

    res.json({
      success: true,
      dominantHex: analysis.dominantHex,
      dominantName: getColorName(analysis.dominantHex),
      palettes,
      outfit_analysis: outfit,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* =========================
   START
========================= */
app.listen(PORT, () => {
  console.log(`VisionCore running on ${PORT}`);
});