import Constants from "expo-constants";
import type { DisplayZone, TransformResponse } from "../types/analysis";
import { normalizeTransformResponse } from "./normalize";

const FALLBACK_API_URL = "https://cie-core-backend-1.onrender.com";
const REQUEST_TIMEOUT_MS = 70_000;

export async function analyzeOutfit(image: { uri: string; mimeType?: string | null; fileName?: string | null }): Promise<DisplayZone[]> {
  const configuredUrl = Constants.expoConfig?.extra?.apiBaseUrl;
  const apiBaseUrl = typeof configuredUrl === "string" ? configuredUrl : FALLBACK_API_URL;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const form = new FormData();
  form.append("image", {
    uri: image.uri,
    type: image.mimeType || "image/jpeg",
    name: image.fileName || "outfit.jpg"
  } as unknown as Blob);

  try {
    const response = await fetch(`${apiBaseUrl}/api/images/transform`, {
      method: "POST",
      body: form,
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`VisionCore returned ${response.status}. Please try again.`);
    const payload = await response.json() as TransformResponse;
    const zones = normalizeTransformResponse(payload);
    if (!zones.length) throw new Error("VisionCore could not confidently identify outfit pieces in this photo.");
    return zones;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("The analysis took too long. Please try the photo again.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
