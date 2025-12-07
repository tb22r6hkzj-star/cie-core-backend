import "dotenv/config";
import express from "express";
import cors from "cors";
import morgan from "morgan";
import multer from "multer";
import Replicate from "replicate";

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(morgan("dev"));

// Multer (store uploaded file in memory)
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Replicate client
const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

// Helper: Normalize Replicate output → clean URL string
async function removeBackground(imageBuffer) {
  const base64Image = `data:image/png;base64,${imageBuffer.toString("base64")}`;

  const result = await replicate.run(
    "cjwbw/rembg:fb8af171cfa1616ddcf1242c093f9c46bcada5ad4cf6f2fbe8b81b330ec5c003",
    {
      input: {
        image: base64Image,
      },
    }
  );

  let url;

  // Case 1: plain string
  if (typeof result === "string") {
    url = result;
  }
  // Case 2: array of strings
  else if (Array.isArray(result) && typeof result[0] === "string") {
    url = result[0];
  }
  // Case 3: object with url() function
  else if (result && typeof result.url === "function") {
    url = await result.url();
  }
  // Case 4: object with url property
  else if (result && typeof result.url === "string") {
    url = result.url;
  } else {
    console.error("Unexpected Replicate output format:", result);
    throw new Error("Unexpected Replicate output format from Replicate");
  }

  return url;
}

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// Main transform endpoint
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

    // Handle Replicate credit errors
    if (error.status === 402) {
      return res.status(402).json({
        success: false,
        message:
          "Replicate: insufficient credit to run this model. Please top up your Replicate account.",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to transform image (server error).",
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
