import { createHash, randomUUID } from "node:crypto";

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

export function buildAnalysisCacheKeyV1({ imageBytes, imageHash, pipelineVersion, semanticModel = "off", semanticSchema = "1" } = {}) {
  const hash = imageHash || (imageBytes ? createHash("sha256").update(imageBytes).digest("hex") : null);
  if (!hash) throw new Error("VisionCore cache key requires image bytes or image hash");
  return [hash, pipelineVersion || "unknown", semanticModel, semanticSchema].join(":");
}

export function createMemoryWardrobeRepositoryV1() {
  const accounts = new Map();
  const archives = new Map();
  const analysisCache = new Map();
  const telemetry = [];

  return {
    async getAccount(accountId) { return clone(accounts.get(accountId) || null); },
    async saveAccount(accountId, account) { accounts.set(accountId, clone(account)); return clone(account); },
    async getCachedAnalysis(cacheKey) { return clone(analysisCache.get(cacheKey) || null); },
    async saveCachedAnalysis(cacheKey, result) { analysisCache.set(cacheKey, clone(result)); return clone(result); },
    async saveLook(accountId, look = {}) {
      const rows = archives.get(accountId) || [];
      const record = {
        id: look.id || randomUUID(),
        created_at: look.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
        title: String(look.title || "Saved Look").slice(0, 120),
        occasion_tags: Array.isArray(look.occasion_tags) ? look.occasion_tags.slice(0, 12).map(String) : [],
        season_tags: Array.isArray(look.season_tags) ? look.season_tags.slice(0, 8).map(String) : [],
        planned_wear_at: look.planned_wear_at || null,
        favorite: Boolean(look.favorite),
        notes: String(look.notes || "").slice(0, 1000),
        image_reference: look.image_reference || null,
        analysis_cache_key: look.analysis_cache_key || null,
        visioncore_result: clone(look.visioncore_result || null),
      };
      const existing = rows.findIndex((row) => row.id === record.id);
      if (existing >= 0) rows[existing] = record;
      else rows.push(record);
      archives.set(accountId, rows);
      return clone(record);
    },
    async listLooks(accountId) { return clone((archives.get(accountId) || []).sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)))); },
    async recordExternalTelemetry(record) { telemetry.push({ ...clone(record), recorded_at: new Date().toISOString() }); },
    async listExternalTelemetry() { return clone(telemetry); },
  };
}
