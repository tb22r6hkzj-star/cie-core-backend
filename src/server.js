// server.js
// ✅ Render-ready Express backend
// ✅ Accepts multipart upload (field name: "image")
// ✅ Uploads image to Cloudinary to obtain a PUBLIC image_url (required by Pixelcut)
// ✅ Calls Pixelcut Remove Background: https://api.developer.pixelcut.ai/v1/remove-background
// ✅ Logs Pixelcut status/body so Render shows the REAL error
// ✅ Global error handler

import express from "express";
import cors from "cors";
import multer from "multer";
import dotenv from "dotenv";
import { v2 as cloudinary } from "cloudinary";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 10000;

// ----- CORS -----
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-API-KEY"],
  })
);

app.use(express.json({ limit: "10mb" }));

// ----- Multer: accept file upload -----
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

// ----- Helpers -----
function requireEnv(name) {
  const val = process.env[name];
  if (!val) {
    const err = new Error(`Missing environment variable: ${name}`);
    err.status = 500;
    throw err;
  }
  return val;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ----- Health -----
app.get("/", (req, res) => res.send("CIE backend up"));
app.get("/health", (req, res) => res.json({ ok: true }));

// ----- Cloudinary setup (REQUIRED for Pixelcut URL mode) -----
function cloudinaryConfigured() {
  return (
    !!process.env.CLOUDINARY_CLOUD_NAME &&
    !!process.env.CLOUDINARY_API_KEY &&
    !!process.env.CLOUDINARY_API_SECRET
  );
}

function initCloudinary() {
  if (!cloudinaryConfigured()) return;
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  });
}

async function uploadToCloudinary(file) {
  if (!cloudinaryConfigured()) {
    const err = new Error(
      "Cloudinary not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET on Render."
    );
    err.status = 400;
    throw err;
  }

  // Convert buffer to data URI (Cloudinary supports this)
  const dataUri = `data:${file.mimetype};base64,${file.buffer.toString("base64")}`;

  const folder = process.env.CLOUDINARY_FOLDER || "cie";
  const publicIdPrefix = process.env.CLOUDINARY_PUBLIC_ID_PREFIX || "upload";

  const result = await cloudinary.uploader.upload(dataUri, {
    folder,
    public_id: `${publicIdPrefix}-${Date.now()}`,
    resource_type: "image",
  });

  if (!result?.secure_url) {
    const err = new Error("Cloudinary upload failed (no secure_url returned).");
    err.status = 502;
    throw err;
  }

  return result.secure_url;
}

// ----- Pixelcut Remove Background -----
async function transformWithPixelcutRemoveBg(imageUrl) {
  const apiKey = requireEnv("PIXELCUT_API_KEY");
  const endpoint = requireEnv("PIXELCUT_ENDPOINT"); // must be full URL
  const format = process.env.PIXELCUT_FORMAT || "png";

  // Pixelcut requires JSON with image_url (NOT base64, NOT multipart)
  const payload = {
    image_url: imageUrl,
    format,
    // optional: shadow config, etc. (only if you want it)
    // shadow: { enabled: false }
  };

  console.log("PIXELCUT endpoint:", endpoint);
  console.log("PIXELCUT payload keys:", Object.keys(payload));

  const resp = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-API-KEY": apiKey,
    },
    body: JSON.stringify(payload),
  });

  const text = await resp.text();

  console.log("PIXELCUT status:", resp.status);
  console.log("PIXELCUT body:", text);

  if (!resp.ok) {
    const err = new Error(`Pixelcut failed: ${resp.status}`);
    err.status = 502;
    err.details = text;
    throw err;
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }

  // Pixelcut docs show result_url in successful response
  return data;
}

// ----- Main Route -----
app.post("/api/images/transform", upload.single("image"), async (req, res, next) => {
  try {
    // Enforce Pixelcut endpoint from your doc:
    // https://api.developer.pixelcut.ai/v1/remove-background
    // (set this in Render as PIXELCUT_ENDPOINT)

    if (!req.file) {
      return res.status(400).json({ error: "No image uploaded. Use form field name 'image'." });
    }

    // 1) Upload to Cloudinary to create a PUBLIC URL Pixelcut can access
    initCloudinary();
    const publicUrl = await uploadToCloudinary(req.file);
    console.log("PUBLIC image_url (Cloudinary):", publicUrl);

    // 2) Send public URL to Pixelcut
    const pixelcutResult = await transformWithPixelcutRemoveBg(publicUrl);

    // 3) Return Pixelcut response to frontend
    return res.json({
      provider: "pixelcut",
      input_url: publicUrl,
      result: pixelcutResult, // should include result_url
    });
  } catch (err) {
    console.error("🔥 /api/images/transform error:", err?.stack || err);
    next(err);
  }
});

// ----- Global Error Handler -----
app.use((err, req, res, next) => {
  const status = err?.status || 500;
  res.status(status).json({
    error: err?.message || "Internal Server Error",
    details: err?.details,
  });
});

// ----- Start -----
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});