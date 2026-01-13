import express from "express";
import cors from "cors";

const app = express();

/* =========================
   CORS — MUST BE FIRST
   ========================= */

const ALLOWED_ORIGINS = [
  "https://famous.ai",
  "https://visioncoreengine.tech",
  "https://www.visioncoreengine.tech",
];

app.use(
  cors({
    origin: function (origin, callback) {
      // Allow server-to-server, curl, Postman (no origin)
      if (!origin) return callback(null, true);

      if (ALLOWED_ORIGINS.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error("CORS not allowed from this origin"));
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: false,
  })
);

// Handle browser preflight requests
app.options("*", cors());

/* =========================
   BODY PARSING
   ========================= */

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

/* =========================
   HEALTH CHECK
   ========================= */

app.get("/", (_req, res) => {
  res.status(200).json({ status: "CIE Core API running" });
});

/* =========================
   RECOMMENDATIONS ENDPOINT
   ========================= */

app.post("/api/recommendations", async (req, res) => {
  try {
    const { ghostImageUrl, mode, itemType } = req.body;

    if (!ghostImageUrl || !mode) {
      return res.status(400).json({
        success: false,
        error: "Missing ghostImageUrl or mode",
      });
    }

    // 🔹 Your existing recommendation logic stays here
    // 🔹 This is just a placeholder response shape
    // 🔹 Keep your real implementation intact

    const paletteHexes = [
      "#F5F5F5",
      "#D1D5DB",
      "#9CA3AF",
      "#374151",
    ];

    return res.json({
      success: true,
      mode,
      itemType: itemType || null,
      recommendation: {
        paletteHexes,
        reason:
          "Palette generated using factual color relationships based on the selected visual intent.",
      },
    });
  } catch (err) {
    console.error("Recommendations error:", err);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
});

/* =========================
   SERVER START
   ========================= */

const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
  console.log(`CIE Core API running on port ${PORT}`);
});