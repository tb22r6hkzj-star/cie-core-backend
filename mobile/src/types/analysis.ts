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
  outfit_analysis?: {
    garment_zones?: {
      zones?: Record<string, RawGarmentZone>;
    };
  };
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
