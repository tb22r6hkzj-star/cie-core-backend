/**
 * Replicate masks may be transparent-alpha masks or opaque black/white PNGs.
 * For opaque images the RGB intensity carries membership; using alpha would
 * incorrectly classify every background pixel as foreground.
 */
export function resolveMaskStrengthV1(r = 0, g = 0, b = 0, alpha = 0) {
  const a = Number(alpha || 0);
  if (a < 250) return Math.max(0, Math.min(255, a));
  return Math.max(0, Math.min(255, (Number(r || 0) + Number(g || 0) + Number(b || 0)) / 3));
}

export function resolveOpaqueMaskStrengthV1(r = 0, g = 0, b = 0, backgroundIntensity = 0) {
  const intensity = (Number(r || 0) + Number(g || 0) + Number(b || 0)) / 3;
  return Math.max(0, Math.min(255, Math.abs(intensity - Number(backgroundIntensity || 0))));
}
