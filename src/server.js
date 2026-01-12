// server.js
// Drop-in Express backend for Render that:
// - accepts image uploads (multipart/form-data)
// - calls either Replicate OR Pixelcut (configurable)
// - logs upstream errors (so Render logs show the REAL cause)
// - includes safe CORS + healthcheck + global error handler

import express from "express";
import cors from "cors";
import multer from "multer";

// If you use dotenv locally, keep this. Render ignores it unless you upload a .env (don't).
import dotenv from "dotenv";
dotenv.config();

const app = express();

// ---------- Config ----------
const PORT = process.env.PORT || 10000;

// CORS: allow your frontend(s). For quick unblock, allow all.
// Later, lock this down to your Famous/Vercel domains.
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-API-KEY"],
  })
);

// JSON parser for non-multipart routes
app.use(express.json({ limit: "10mb" }));

// Multer for multipart/form-data uploads (the uploaded file must be in field name: "image")
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }, // 8MB
});

// ---------- Health ----------
app.get("/", (req, res) => res.send("CIE backend up"));
app.get("/health", (req, res) => res.json({ ok: true }));

// ---------- Helpers ----------
function requireEnv(name) {
  const v = process.env[name];
  if (!v) {
    const err = new Error(`Missing environment variable: ${name}`);
    err.status = 500;
    throw err;
  }
  return v;
}

function toDataUri(file) {
  // Replicate commonly accepts data URI base64
  const mime = file.mimetype || "image/png";
  const b64 = file.buffer.toString("base64");
  return `data:${mime};base64,${b64}`;
}

async function fetchText(url, options) {
  const resp = await fetch(url, options);
  const text = await resp.text();
  return { resp, text };
}

// ---------- Provider: Replicate (recommended if your logs show api.replicate.com) ----------
async function transformWithReplicate(file) {
  const token = requireEnv("REPLICATE_API_TOKEN");
  const version = requireEnv("REPLICATE_MODEL_VERSION"); // you must set this to the model version ID
  const inputKey = process.env.REPLICATE_INPUT_IMAGE_KEY || "image"; // some models use "image"

  // Create prediction
  const createUrl = "https://api.replicate.com/v1/predictions";
  const createBody = {
    version,
    input: {
      [inputKey]: toDataUri(file),
      // add more model inputs here if needed:
      // e.g. prompt, scale, etc.
    },
  };

  const { resp: createResp, text: createText } = await fetchText(createUrl, {
    method: "POST",
    headers: {
      Authorization: `Token ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(createBody),
  });

  console.log("REPLICATE create status:", createResp.status);
  if (!createResp.ok) {
    console.log("REPLICATE create body:", createText);
    const err = new Error(`Replicate create failed: ${createResp.status}`);
    err.status = 502;
    throw err;
  }

  const created = JSON.parse(createText);
  let prediction = created;

  // Poll until done (avoid infinite loop)
  const maxPolls = Number(process.env.REPLICATE_MAX_POLLS || 20);
  const pollDelayMs = Number(process.env.REPLICATE_POLL_DELAY_MS || 1500);

  for (let i = 0; i < maxPolls; i++) {
    if (prediction.status === "succeeded") break;
    if (prediction.status === "failed" || prediction.status === "canceled") break;

    await new Promise((r) => setTimeout(r, pollDelayMs));

    const pollUrl = `https://api.replicate.com/v1/predictions/${prediction.id}`;
    const { resp: pollResp, text: pollText } = await fetchText(pollUrl, {
      method: "GET",
      headers: {
        Authorization: `Token ${token}`,
        Accept: "application/json",
      },
    });

    console.log("REPLICATE poll status:", pollResp.status);
    if (!pollResp.ok) {
      console.log("REPLICATE poll body:", pollText);
      const err = new Error(`Replicate poll failed: ${pollResp.status}`);
      err.status = 502;
      throw err;
    }

    prediction = JSON.parse(pollText);
  }

  if (prediction.status !== "succeeded") {
    console.log("REPLICATE final prediction:", prediction);
    const err = new Error(`Replicate failed: ${prediction.status}`);
    err.status = 502;
    throw err;
  }

  // Many models return output as a URL or array of URLs.
  return { provider: "replicate", output: prediction.output, predictionId: prediction.id };
}

// ---------- Provider: Pixelcut Developer API ----------
// Pixelcut docs show X-API-KEY header and often accept image_url.
// Because your frontend uploads a FILE, Pixelcut will require either:
//   A) an endpoint that accepts file/base64, OR
//   B) you upload the file to a public URL first, then send image_url.
//
// This implementation supports two modes controlled by env:
// - PIXELCUT_MODE="base64"  -> sends { image_base64: "...", format: "png" }  (ONLY if your Pixelcut endpoint supports it)
// - PIXELCUT_MODE="url"     -> expects you to provide a public URL in req.body.image_url (no file required)
//
// You MUST set PIXELCUT_ENDPOINT to the Pixelcut API endpoint you are using.
async function transformWithPixelcut({ file, imageUrlFromBody }) {
  const apiKey = requireEnv("PIXELCUT_API_KEY");
  const endpoint = requireEnv("PIXELCUT_ENDPOINT"); // e.g. https://api.developer.pixelcut.ai/v1/<your-endpoint>
  const mode = (process.env.PIXELCUT_MODE || "base64").toLowerCase();
  const format = process.env.PIXELCUT_FORMAT || "png";

  let body;

  if (mode === "url") {
    if (!imageUrlFromBody) {
      const err = new Error(
        "PIXELCUT_MODE=url requires req.body.image_url (a public URL). Pixelcut quickstart uses image_url."
      );
      err.status = 400;
      throw err;
    }
    body = { image_url: imageUrlFromBody, format };
  } else {
    // base64 mode
    if (!file) {
      const err = new Error("No file uploaded. Send multipart field name 'image'.");
      err.status = 400;
      throw err;
    }
    const b64 = file.buffer.toString("base64");
    // IMPORTANT: Only works if your Pixelcut endpoint supports base64 input.
    body = { image_base64: b64, format };
  }

  const { resp, text } = await fetchText(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-API-KEY": apiKey,
    },
    body: JSON.stringify(body),
  });

  console.log("PIXELCUT status:", resp.status);
  if (!resp.ok) {
    console.log("PIXELCUT body:", text);
    const err = new Error(`Pixelcut failed: ${resp.status}`);
    err.status = 502;
    throw err;
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }

  return { provider: "pixelcut", output: data };
}

// ---------- Main Route ----------
app.post("/api/images/transform", upload.single("image"), async (req, res, next) => {
  try {
    // Decide provider:
    // - Set TRANSFORM_PROVIDER=replicate or pixelcut on Render
    // - If not set, auto-detect: if REPLICATE_API_TOKEN exists -> replicate, else pixelcut
    const provider =
      (process.env.TRANSFORM_PROVIDER || "").toLowerCase() ||
      (process.env.REPLICATE_API_TOKEN ? "replicate" : "pixelcut");

    const file = req.file; // uploaded file in "image"
    const imageUrlFromBody = req.body?.image_url; // if using PIXELCUT_MODE=url

    if (provider === "replicate") {
      const result = await transformWithReplicate(file);
      return res.json(result);
    }

    if (provider === "pixelcut") {
      const result = await transformWithPixelcut({ file, imageUrlFromBody });
      return res.json(result);
    }

    const err = new Error(
      `Unknown TRANSFORM_PROVIDER='${provider}'. Use 'replicate' or 'pixelcut'.`
    );
    err.status = 500;
    throw err;
  } catch (err) {
    // Route-level logging so Render shows the true cause
    console.error("🔥 /api/images/transform error:", err?.stack || err);
    next(err);
  }
});

// ---------- Global Error Handler (must be after routes) ----------
app.use((err, req, res, next) => {
  const status = err?.status || 500;
  res.status(status).json({
    error: err?.message || "Internal Server Error",
  });
});

// ---------- Start ----------
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log("TRANSFORM_PROVIDER:", process.env.TRANSFORM_PROVIDER || "(auto)");
});