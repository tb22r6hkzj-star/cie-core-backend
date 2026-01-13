import express from "express";
import cors from "cors";
import multer from "multer";
import dotenv from "dotenv";
import { v2 as cloudinary } from "cloudinary";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 10000;

/* =========================
   CORS — ALLOW FAMOUS PREVIEW + YOUR SITE
   (Most Famous previews are on *.famous.ai subdomains)
   ========================= */

const allowOrigin = (origin) => {
  if (!origin) return true; // curl/postman/server-to-server

  // Allow your production domains
  if (origin === "https://visioncoreengine.tech") return true;
  if (origin === "https://www.visioncoreengine.tech") return true;

  // Allow Famous main + Famous preview subdomains
  if (origin === "https://famous.ai") return true;
  if (origin.endsWith(".famous.ai")) return true;

  return false;
};

app.use(
  cors({
    origin: function (origin, cb) {
      if (allowOrigin(origin)) return cb(null, true);
      return cb(null, false);
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-API-KEY"],
    credentials: false,
  })
);

// Handle preflight for all routes
app.options("*", cors());

/* =========================
   BODY PARSING
   ========================= */

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

/* =========================
   MULTER (upload)
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
   COLOR MATH HELPERS
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
  return rgbToHex(
    hslToRgb({
      h: hsl.h,
      s: clamp01(Math.min(hsl.s, 0.35)),
      l: clamp01(Math.max(hsl.l, 0.78)),
    })
  );
}

function toMuted(hex) {
  const hsl = rgbToHsl(hexToRgb(hex));
  return rgbToHex(
    hslToRgb({
      h: hsl.h,
      s: clamp01(Math.min(hsl.s, 0.4)),
      l: clamp01(Math.min(Math.max(hsl.l, 0.3), 0.7)),
    })
  );
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
    neutrals: { hexes: neutrals, reason: "Neutral anchors (low-saturation) for compatibility." },
    earthTones: { hexes: earthDerived, reason: "Earth tones via muted saturation + olive/tan shifts." },
    pastels: { hexes: pastels, reason: "Pastels via high lightness + lower saturation transform." },
    bold: { hexes: bold, reason: "Bold palette uses dominant + hue relationships (contrast/triad/analogous)." },
    complementary: {
      hex: complementaryHex.toUpperCase(),
      reason: `Complementary hue computed as (H+180) mod 360.`,
    },
    analogous: { hexes: [analogousLeftHex.toUpperCase(), analogousRightHex.toUpperCase()], reason: "Analogous hues computed as H±30." },
    triad: { hexes: [triad1Hex.toUpperCase(), triad2Hex.toUpperCase()], reason: "Triadic hues computed as H+120 and H+240." },
    dominant: { hex: dominantHex.toUpperCase(), reason: "Dominant HEX extracted from ghost image pixels." },
  };
}

/* =========================
   IMAGE OPS: Cloudinary + Pixelcut
   ========================= */

async function uploadToCloudinary(file) {
  const dataUri = `data:${file.mimetype};base64,${file.buffer.toString("base64")}`;
  const result = await cloudinary.uploader.upload(dataUri, { folder: "cie", resource_type: "image" });
  if (!result?.secure_url) throw new Error("Cloudinary upload failed (no secure_url)");
  return result.secure_url;
}

async function callPixelcutRemoveBg(imageUrl) {
  if (!process.env.PIXELCUT_API_KEY || !process.env.PIXELCUT_ENDPOINT) {
    throw new Error("Missing Pixelcut env vars");
  }

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
  if (!resp.ok) throw new Error(`Pixelcut failed: ${resp.status} ${text}`);

  const data = JSON.parse(text);
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

  const dominantHex = String(colors[0][0]).toUpperCase();
  const hsl = rgbToHsl(hexToRgb(dominantHex));
  const family = classifyFamilyFromHsl(hsl);

  return { dominantHex, hsl, family };
}

/* =========================
   ROUTES
   ========================= */

// Upload → ghost → analysis. Must return frontend contract keys.
app.post("/api/images/transform", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: "No image uploaded" });

    const publicUrl = await uploadToCloudinary(req.file);
    const ghostUrl = await callPixelcutRemoveBg(publicUrl);
    const analysis = await analyzeGhostColors(ghostUrl);
    const palettes = buildPalettes(analysis.dominantHex);

    const summary = `Primary color detected. Use recommendations below for balanced, contrast, cohesive, emphasis, natural, or explore directions.`;

    return res.json({
      success: true,
      ghostImageUrl: ghostUrl,
      garmentColorFamily: analysis.family,
      summary,
      dominantHex: analysis.dominantHex,
      palettes,
    });
  } catch (err) {
    console.error("transform error:", err?.message || err);
    return res.status(500).json({ success: false, error: err?.message || "Unknown error" });
  }
});

// Recommendations (called by the intent cards)
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

app.post("/api/recommendations", async (req, res) => {
  try {
    const { ghostImageUrl, mode, itemType } = req.body || {};
    if (!ghostImageUrl) return res.status(400).json({ success: false, error: "ghostImageUrl is required" });

    const analysis = await analyzeGhostColors(ghostImageUrl);
    const palettes = buildPalettes(analysis.dominantHex);

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
      reason = "Same-family palette computed by tight hue shifts around the dominant hue.";
    } else {
      const combined = [
        palettes.dominant.hex,
        ...palettes.neutrals.hexes,
        palettes.complementary.hex,
        ...palettes.analogous.hexes,
      ];
      paletteHexes = [...new Set(combined.map((x) => x.toUpperCase()))].slice(0, 12);
      reason = "Exploratory set combining dominant + neutrals + complementary + analogous directions.";
    }

    return res.json({
      success: true,
      mode: selected,
      itemType: itemType || null,
      dominantHex: analysis.dominantHex,
      garmentColorFamily: analysis.family,
      recommendation: { paletteHexes, reason },
    });
  } catch (err) {
    console.error("recommendations error:", err?.message || err);
    return res.status(500).json({ success: false, error: err?.message || "Unknown error" });
  }
});

/* =========================
   START
   ========================= */

app.listen(PORT, () => {
  console.log(`✅ CIE Core backend running on port ${PORT}`);
});