import type { AnalysisResult, DisplayZone, RawGarmentZone, TransformResponse } from "../types/analysis";

const ZONE_LABELS: Record<string, string> = {
  upper_garment: "Upper Garment",
  lower_garment: "Lower Garment",
  footwear: "Footwear",
  outerwear: "Outerwear",
  bag: "Bag",
  eyewear: "Eyewear"
};

function titleCase(value: string): string {
  return value.replace(/^accessory_/, "").replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function normalizeConfidence(value: number | null | undefined): number {
  const numeric = Number(value ?? 0);
  return Math.max(0, Math.min(100, numeric <= 1 ? Math.round(numeric * 100) : Math.round(numeric)));
}

export function normalizeZone(key: string, zone: RawGarmentZone): DisplayZone {
  const authoritativeColor = zone.primary_color ?? zone.dominant_color;
  const hex = authoritativeColor?.hex ?? zone.hex ?? zone.dominant_hex ?? null;
  const colorWithheld = !hex || Boolean(zone.color_publication_decision && !zone.color_publication_decision.startsWith("publish"));

  // Never allow a legacy display alias to override the authoritative primary color.
  const colorName = colorWithheld ? null : authoritativeColor?.name ?? zone.name ?? null;
  const isAccessory = key.startsWith("accessory_");
  const pieceLabel = isAccessory
    ? titleCase(zone.label || key)
    : ZONE_LABELS[key] || titleCase(zone.label || key);

  return {
    key,
    pieceLabel,
    colorName,
    colorTranslation: colorWithheld ? null : authoritativeColor?.name === zone.color_identity?.name
      ? zone.color_identity?.translation ?? null
      : authoritativeColor?.name ?? null,
    hex,
    confidence: normalizeConfidence(zone.confidence ?? zone.score),
    colorWithheld
  };
}

export function normalizeTransformResponse(response: TransformResponse): DisplayZone[] {
  const zones = response.outfit_analysis?.garment_zones?.zones ?? {};
  return Object.entries(zones)
    .filter(([, zone]) => zone.identity_publication_decision !== "withhold")
    .map(([key, zone]) => normalizeZone(key, zone));
}

export function normalizeAnalysisResult(response: TransformResponse): AnalysisResult {
  const analysis = response.outfit_analysis;
  const modes = (analysis?.mode_scores ?? []).map((entry) => {
    const key = String(entry.mode || "").toLowerCase();
    const palette = response.palettes?.[key];
    return {
      mode: entry.mode || titleCase(key),
      score: Number(entry.score ?? 0),
      colors: palette?.named_hexes?.length
        ? palette.named_hexes
        : (palette?.hexes ?? []).map((hex) => ({ hex })),
      reason: palette?.reason ?? null
    };
  });
  return {
    zones: normalizeTransformResponse(response),
    outfitScore: Number(analysis?.outfit_score ?? 0),
    bestMode: analysis?.best_mode ?? null,
    bestModeScore: Number(analysis?.best_mode_score ?? 0),
    scoreBreakdown: Object.entries(analysis?.score_breakdown ?? {}).map(([label, value]) => ({
      label: titleCase(label),
      value: Number(value)
    })),
    whyThisWorks: analysis?.why_this_works ?? null,
    suggestedAdjustment: analysis?.suggested_adjustment ?? null,
    dominantHex: response.dominantHex ?? null,
    dominantName: response.dominantName ?? null,
    modes
  };
}
