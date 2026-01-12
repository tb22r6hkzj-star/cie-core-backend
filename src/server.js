import express from "express";
import cors from "cors";
import multer from "multer";
import dotenv from "dotenv";
import { v2 as cloudinary } from "cloudinary";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 10000;

/* -------------------- Middleware -------------------- */

app.use(cors({ origin: "*", methods: ["GET", "POST"] }));
app.use(express.json({ limit: "10mb" }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

/* -------------------- Cloudinary -------------------- */

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

/* -------------------- Health -------------------- */

app.get("/", (_, res) => res.send("CIE backend running"));
app.get("/health", (_, res) => res.json({ ok: true }));

/* -------------------- Helpers -------------------- */

function requireEnv(name) {
  if (!process.env[name]) {
    throw new Error(`Missing environment variable: ${name}`);
  }
}

async function uploadToCloudinary(file) {
  const dataUri = `data:${file.mimetype};base64,${file.buffer.toString("base64")}`;

  const result = await cloudinary.uploader.upload(dataUri, {
    folder: "cie",
    resource_type: "image",
  });

  if (!result?.secure_url) {
    throw new Error("Cloudinary upload failed");
  }

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
    },
    body: JSON.stringify({
      image_url: imageUrl,
      format: "png",
    }),
  });

  const text = await resp.text();
  console.log("PIXELCUT status:", resp.status);
  console.log("PIXELCUT body:", text);

  if (!resp.ok) {
    throw new Error(`Pixelcut failed: ${resp.status}`);
  }

  const data = JSON.parse(text);
  return data.result_url;
}

/* -------------------- Main Route -------------------- */

app.post("/api/images/transform", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: "No image uploaded" });
    }

    // 1️⃣ Upload to Cloudinary
    const publicUrl = await uploadToCloudinary(req.file);

    // 2️⃣ Send URL to Pixelcut
    const ghostUrl = await callPixelcutRemoveBg(publicUrl);

    if (!ghostUrl) {
      return res.status(502).json({
        success: false,
        error: "Pixelcut did not return result_url",
      });
    }

    // 3️⃣ RETURN WHAT FRONTEND EXPECTS ✅
    return res.json({
      success: true,
      ghostImageUrl: ghostUrl,
      garmentColorFamily: null,
      summary: null,
    });
  } catch (err) {
    console.error("🔥 transform error:", err.message);
    return res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

/* -------------------- Start -------------------- */

app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});