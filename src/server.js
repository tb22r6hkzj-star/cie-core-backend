// server.js — FULL REPLACEMENT (copy/paste entire file)
//
// ✅ Upload image (multipart) -> Cloudinary URL
// ✅ Pixelcut remove-background -> ghostImageUrl
// ✅ Factual dominant color extraction (Cloudinary colors analysis) -> dominantHex + HSL + family
// ✅ Palette math (complementary/analogous/triad/neutrals/earth/pastels/bold) with “reason”
// ✅ /api/images/transform returns frontend contract: success, ghostImageUrl, garmentColorFamily, summary (+ optional palettes)
// ✅ /api/recommendations returns factual palettes for UI modes (Neutrals/Earth tones/Bold/Pastels/Complementary/Same family/All)

import express from "express";
import cors from "cors";
import multer from "multer";
import dotenv from "dotenv";
import { v2 as cloudinary } from "cloudinary";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors({ origin: "*", methods: ["GET", "POST"] }));
app.use(express.json({ limit: "10mb" }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

function requireEnv(name) {
  if (!process.env[name]) throw new Error(`Missing environment variable: ${name}`);
}

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

app.get("/", (_, res) => res.send("CIE backend running"));
app.get("/health", (_, res) => res.json({ ok: true }));

/* -------------------- Color Math Helpers -------------------- */

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

// RGB (0-255) -> HSL (h 0-360, s/l 0-1)
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

// HSL -> RGB
function hslToRgb({ h, s, l }) {
  const C = (1 - Math.abs(2 * l - 1)) * s;
  const X = C * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - C / 2;

  let r1 = 0,
    g1 = 0,
    b1 = 0;

  if (0 <= h && h < 60) [r1, g1, b1] = [C, X, 0];
  else if (60 <= h && h < 120) [r1, g1, b1] = [X, C, 0];
  else if (120 <= h && h < 180) [r1, g1, b1] = [0, C, X];
  else if (180 <= h && h < 240) [r1, g1, b1] = [0, X, C];
  else if (240 <= h && h < 300) [r1, g1, b1] = [X, 0, C];
  else [r1, g1, b1] = [C, 0, X];

  return {
    r: Math.round((r1 + m) * 255),
    g: Math.round((g1 + m) * 255),
    b: Math.round((b1 + m) * 255),
  };
}

function shiftHue(hex, degrees) {
  const hsl = rgbToHsl(hexToRgb(hex));
  const h = (hsl.h + degrees + 360) % 360;
  return rgbToHex(hslToRgb({ h, s: hsl.s, l: hsl.l }));
}

function toPastel(hex) {
  const hsl = rgbToHsl(hexToRgb(hex));
  // Pastel = high lightness + lower saturation (factual definition)
  const pastel = {
    h: hsl.h,
    s: clamp01(Math.min(hsl.s, 0.35)),
    l: clamp01(Math.max(hsl.l, 0.78)),
  };
  return rgbToHex(hslToRgb(pastel));
}

function toMuted(hex) {
  const hsl = rgbToHsl(hexToRgb(hex));
  // Muted = cap saturation, keep mid lightness
  const muted = {
    h: hsl.h,
    s: clamp01(Math.min(hsl.s, 0.4)),
    l: clamp01(Math.min(Math.max(hsl.l, 0.3), 0.7)),
  };
  return rgbToHex(hslToRgb(muted));
}

function classifyFamilyFromHsl({ h, s, l }) {
  // Neutrals: very low saturation
  if (s < 0.12) return "neutrals";
  // Pastels: factual definition
  if (l > 0.75 && s < 0.35) return "pastels";
  // Earth tones: muted oranges/browns + greens
  const earthHue = (h >= 15 && h <= 60) || (h >= 70 && h <= 165);
  if (earthHue && s <= 0.55 && l >= 0.25 && l <= 0.75) return "earth-tones";
  // Bold colors: higher saturation
  if (s >= 0.55) return "bold-colors";

  // Hue families
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
  const analogousLeftHue = (H - 30 + 360) % 360;
  const analogousRightHue = (H + 30) % 360;
  const triad1Hue = (H + 120) % 360;
  const triad2Hue = (H + 240) % 360;

  const complementaryHex = rgbToHex(hslToRgb({ h: complementaryHue, s: hsl.s, l: hsl.l }));
  const analogousLeftHex = rgbToHex(hslToRgb({ h: analogousLeftHue, s: hsl.s, l: hsl.l }));
  const analogousRightHex = rgbToHex(hslToRgb({ h: analogousRightHue, s: hsl.s, l: hsl.l }));
  const triad1Hex = rgbToHex(hslToRgb({ h: triad1Hue, s: hsl.s, l: hsl.l }));
  const triad2Hex = rgbToHex(hslToRgb({ h: triad2Hue, s: hsl.s, l: hsl.l }));

  const neutrals = ["#111111", "#2B2B2B", "#7A7A7A", "#CFCFCF", "#F5F1E8"];

  const earthDerived = [
    toMuted(shiftHue(dominantHex, 90)),
    toMuted(shiftHue(dominantHex, 35)),
    toMuted(shiftHue(dominantHex, 180)),
    "#8C6A3F",
    "#2F5D50",
  ].map((x) => x.toUpperCase());

  const pastels = [
    toPastel(dominantHex),
    toPastel(analogousLeftHex),
    toPastel(analogousRightHex),
    "#F7C6D0",
    "#C7D9FF",
  ].map((x) => x.toUpperCase());

  const bold = [
    dominantHex.toUpperCase(),
    analogousLeftHex.toUpperCase(),
    analogousRightHex.toUpperCase(),
    complementaryHex.toUpperCase(),
    triad1Hex.toUpperCase(),
    triad2Hex.toUpperCase(),
  ];

  return {
    dominant: {
      hex: dominantHex.toUpperCase(),
      hsl,
      reason: `Dominant HEX extracted from ghost image pixels via Cloudinary colors analysis. Hue=${H}°, Sat=${hsl.s.toFixed(
        2
      )}, Light=${hsl.l.toFixed(2)}.`,
    },
    complementary: {
      hex: complementaryHex.toUpperCase(),
      hue: complementaryHue,
      reason: `Complementary hue computed as (H+180) mod 360: (${H}+180) mod 360 = ${complementaryHue}.`,
    },
    analogous: {
      hexes: [analogousLeftHex.toUpperCase(), analogousRightHex.toUpperCase()],
      hues: [analogousLeftHue, analogousRightHue],
      reason: `Analogous hues computed as H±30: left=${analogousLeftHue}, right=${analogousRightHue}.`,
    },
    triad: {
      hexes: [triad1Hex.toUpperCase(), triad2Hex.toUpperCase()],
      hues: [triad1Hue, triad2Hue],
      reason: `Triadic hues computed as H+120 and H+240: ${triad1Hue}, ${triad2Hue}.`,
    },
    neutrals: {
      hexes: neutrals,
      reason: "Neutral palette uses low-saturation grayscale/cream anchors for maximum compatibility.",
    },
    earthTones: {
      hexes: earthDerived,
      reason: "Earth tones generated by muting saturation and shifting hue toward olive/tan ranges (rule-based).",
    },
    pastels: {
      hexes: pastels,
      reason: "Pastels generated by enforcing high lightness and low saturation (L>0.78, S<=0.35) on hue variants.",
    },
    bold: {
      hexes: bold,
      reason: "Bold palette uses hue relationships (dominant + analogous + complementary + triad).",
    },
  };
}

/* -------------------- Image Ops -------------------- */

async function uploadToCloudinary(file) {
  const dataUri = `data:${file.mimetype};base64,${file.buffer.toString("base64")}`;

  const result = await cloudinary.uploader.upload(dataUri, {
    folder: "cie",
    resource_type: "image",
  });

  if (!result?.secure_url) throw new Error("Cloudinary upload failed (no secure_url)");
  console.log("PUBLIC image_url (Cloudinary):", result.secure_url);
  return result.secure_url;
}

async function callPixelcutRemoveBg(imageUrl) {
  requireEnv("PIXELCUT_API_KEY");
  requireEnv("PIXELCUT_ENDPOINT");

  const resp = await fetch(process.env.PIXELCUT_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-KEY": process.env.PIXELCUT_API_KEY,
      Accept: "application/json",
    },
    body: JSON.stringify({ image_url: imageUrl, format: "png" }),
  });

  const text = await resp.text();
  console.log("PIXELCUT status:", resp.status);
  console.log("PIXELCUT body:", text);

  if (!resp.ok) throw new Error(`Pixelcut failed: ${resp.status}`);
  const data = JSON.parse(text);
  return data.result_url;
}

// Factual dominant color extraction using Cloudinary’s colors analysis on the ghost image
async function analyzeGhostColors(ghostUrl) {
  const res = await cloudinary.uploader.upload(ghostUrl, {
    folder: "cie/ghost",
    resource_type: "image",
    colors: true,
  });

  const colors = Array.isArray(res.colors) ? res.colors : [];
  if (!colors.length) throw new Error("Color analysis failed (Cloudinary returned no colors)");

  const dominantHex = String(colors[0][0]).toUpperCase();
  const hsl = rgbToHsl(hexToRgb(dominantHex));
  const family = classifyFamilyFromHsl(hsl);

  return { dominantHex, hsl, family };
}

/* -------------------- Recommendation Helpers -------------------- */

function normalizeMode(mode) {
  const m = String(mode || "").toLowerCase().trim();
  if (m.includes("neutral")) return "neutrals";
  if (m.includes("earth")) return "earthTones";
  if (m.includes("pastel")) return "pastels";
  if (m.includes("bold")) return "bold";
  if (m.includes("complement")) return "complementary";
  if (m.includes("analog")) return "analogous";
  if (m.includes("triad")) return "triad";
  if (m.includes("same")) return "sameFamily";
  if (m.includes("all")) return "all";
  return "neutrals";
}

function sameFamilyPalette(dominantHex) {
  return [
    dominantHex.toUpperCase(),
    shiftHue(dominantHex, -12),
    shiftHue(dominantHex, +12),
    shiftHue(dominantHex, -24),
    shiftHue(dominantHex, +24),
  ].map((x) => x.toUpperCase());
}

/* -------------------- Routes -------------------- */

// Main pipeline: upload -> ghost -> analyze -> palettes
app.post("/api/images/transform", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: "No image uploaded" });

    // 1) Upload original to Cloudinary for a public URL
    const publicUrl = await uploadToCloudinary(req.file);

    // 2) Pixelcut remove background -> ghost URL
    const ghostUrl = await callPixelcutRemoveBg(publicUrl);
    if (!ghostUrl) return res.status(502).json({ success: false, error: "Pixelcut did not return result_url" });

    // 3) Analyze dominant HEX from ghost image (factual)
    const analysis = await analyzeGhostColors(ghostUrl);

    // 4) Build factual palettes
    const palettes = buildPalettes(analysis.dominantHex);

    // 5) Factual summary (no vibes)
    const summary = `Dominant HEX ${analysis.dominantHex} with Hue ${analysis.hsl.h}°. Complementary hue computed as (H+180) mod 360 = ${(analysis.hsl.h + 180) %
      360}°.`;

    // ✅ Frontend contract + extra intelligence payload
    return res.json({
      success: true,
      ghostImageUrl: ghostUrl,
      garmentColorFamily: analysis.family,
      summary,
      dominantHex: analysis.dominantHex,
      palettes,
    });
  } catch (err) {
    console.error("🔥 transform error:", err?.message || err);
    return res.status(500).json({ success: false, error: err?.message || "Unknown error" });
  }
});

// Recommendations endpoint: returns factual palettes for UI selection (no catalog required)
app.post("/api/recommendations", async (req, res) => {
  try {
    const { ghostImageUrl, mode, itemType } = req.body || {};
    if (!ghostImageUrl) return res.status(400).json({ success: false, error: "ghostImageUrl is required" });

    // 1) Analyze dominant color (factual)
    const analysis = await analyzeGhostColors(ghostImageUrl);

    // 2) Build palettes
    const palettes = buildPalettes(analysis.dominantHex);

    // 3) Select based on mode
    const selected = normalizeMode(mode);

    let paletteHexes = [];
    let reason = "";

    if (selected === "neutrals") {
      paletteHexes = palettes.neutrals.hexes;
      reason = palettes.neutrals.reason;
    } else if (selected === "earthTones") {
      paletteHexes = palettes.earthTones.hexes;
      reason = palettes.earthTones.reason;
    } else if (selected === "pastels") {
      paletteHexes = palettes.pastels.hexes;
      reason = palettes.pastels.reason;
    } else if (selected === "bold") {
      paletteHexes = palettes.bold.hexes;
      reason = palettes.bold.reason;
    } else if (selected === "complementary") {
      paletteHexes = [palettes.complementary.hex];
      reason = palettes.complementary.reason;
    } else if (selected === "analogous") {
      paletteHexes = palettes.analogous.hexes;
      reason = palettes.analogous.reason;
    } else if (selected === "triad") {
      paletteHexes = palettes.triad.hexes;
      reason = palettes.triad.reason;
    } else if (selected === "sameFamily") {
      paletteHexes = sameFamilyPalette(analysis.dominantHex);
      reason = `Same-family palette computed by tight hue shifts around dominant hue (±12°, ±24°). Dominant HEX ${analysis.dominantHex}.`;
    } else {
      // all = broad set: dominant + neutral anchors + complementary + analogous
      const combined = [
        palettes.dominant.hex,
        ...palettes.neutrals.hexes,
        palettes.complementary.hex,
        ...palettes.analogous.hexes,
      ];
      paletteHexes = [...new Set(combined.map((x) => x.toUpperCase()))].slice(0, 12);
      reason =
        "All-colors mode returns a broad, mathematically grounded set: dominant + neutral anchors + complementary + analogous hues.";
    }

    return res.json({
      success: true,
      mode: selected,
      itemType: itemType || null,
      dominantHex: analysis.dominantHex,
      garmentColorFamily: analysis.family,
      recommendation: {
        paletteHexes,
        reason,
      },
    });
  } catch (err) {
    console.error("🔥 recommendations error:", err?.message || err);
    return res.status(500).json({ success: false, error: err?.message || "Unknown error" });
  }
});

/* -------------------- Start -------------------- */

app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});