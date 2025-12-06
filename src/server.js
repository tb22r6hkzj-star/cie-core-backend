// server.js

import "dotenv/config";
import express from "express";
import cors from "cors";
import morgan from "morgan";
import multer from "multer";
import Replicate from "replicate";

const app = express();
const PORT = process.env.PORT || 5000;

// ─────────────────────────────────────────────
// Middleware
// ─────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(morgan("dev"));

// Multer stores uploaded image in memory
const storage = multer.memoryStorage();
const upload = multer({ storage });

// ─────────────────────────────────────────────
// Replicate client
// ─────────────────────────────────────────────
const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

// Background removal helper
async function removeBackground(imageBuffer) {
  const base64Image = `data:image/png;base64,${imageBuffer.toString("base64")}`;

  const output = await replicate.run(
    "cjwbw/rembg:fb8af171cfe1a61dddcf1242cc093f9c408dfc5b0b52dff78eaefbf19f108a9",
    {
      input: {
        image: base64Image,
      },
    }
  );

  return Array.isArray(output) ? output[0] : output;
}

// ─────────────────────────────────────────────
// Routes
// ─────────────────────────────────────────────

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// Image transform route
app.post("/api/images/transform", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No image file uploaded.",
      });
    }

    console.log("🟦 Received upload:", req.file.originalname);

    const outputUrl = await removeBackground(req.file.buffer);

    return res.json({
      success: true,
      ghostImageUrl: outputUrl,
    });
  } catch (error) {
    console.error("❌ Transform Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to transform image (server error).",
    });
  }
});

// ─────────────────────────────────────────────
// Start server
// ─────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
