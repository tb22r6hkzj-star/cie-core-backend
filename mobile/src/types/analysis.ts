export type ColorValue = {
  hex?: string | null;
  name?: string | null;
  pct?: number | null;
  percentage?: number | string | null;
};

export type RawGarmentZone = {
  zone?: string;
  label?: string | null;
  name?: string | null;
  display_label?: string | null;
  display_zone_label?: string | null;
  hex?: string | null;
  dominant_hex?: string | null;
  confidence?: number | null;
  score?: number | null;
  interpretation?: string | null;
  identity_publication_decision?: string | null;
  color_publication_decision?: string | null;
  primary_color?: ColorValue | null;
  dominant_color?: ColorValue | null;
  color_identity?: {
    name?: string | null;
    translation?: string | null;
  } | null;
  detected_colors?: ColorValue[];
};

export type TransformResponse = {
  dominantHex?: string | null;
  dominantName?: string | null;
  palettes?: Record<string, {
    hexes?: string[];
    named_hexes?: ColorValue[];
    reason?: string | null;
  }>;
  outfit_analysis?: {
    outfit_score?: number | null;
    best_mode?: string | null;
    best_mode_score?: number | null;
    mode_scores?: Array<{ mode?: string; score?: number }>;
    score_breakdown?: Record<string, number>;
    why_this_works?: string | null;
    suggested_adjustment?: string | null;
    garment_zones?: {
      zones?: Record<string, RawGarmentZone>;
    };
  };
};

export type ModeResult = {
  mode: string;
  score: number;
  colors: ColorValue[];
  reason: string | null;
};

export type AnalysisResult = {
  zones: DisplayZone[];
  outfitScore: number;
  bestMode: string | null;
  bestModeScore: number;
  scoreBreakdown: Array<{ label: string; value: number }>;
  whyThisWorks: string | null;
  suggestedAdjustment: string | null;
  dominantHex: string | null;
  dominantName: string | null;
  modes: ModeResult[];
};

export type DisplayZone = {
  key: string;
  pieceLabel: string;
  colorName: string | null;
  colorTranslation: string | null;
  hex: string | null;
  confidence: number;
  colorWithheld: boolean;
};
