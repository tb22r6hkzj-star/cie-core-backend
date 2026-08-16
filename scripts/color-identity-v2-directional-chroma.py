from pathlib import Path

p=Path('src/engines/labelMapper/index.js')
s=p.read_text()
anchor='''function uniqHexes(hexes = []) {'''
helper='''function getDirectionalChromaticIdentity(hex) {
  const safe = safeHex(hex);
  if (!safe) return null;

  const hue = getHue(safe);
  const saturation = getSat(safe);
  const lightness = getLight(safe);
  const chromaMagnitude = getChromaMagnitudeFromLab(getLab(safe));
  const [red, green, blue] = chroma(safe).rgb();
  const greenLead = green - Math.max(red, blue);

  // Muted colors can still carry stable chromatic direction. Do not collapse a
  // repeatably green-biased sample into gray merely because saturation is low.
  if (
    hue >= 105 && hue < 145 &&
    saturation >= 0.075 &&
    lightness >= 0.18 && lightness <= 0.62 &&
    chromaMagnitude >= 8 &&
    greenLead >= 8
  ) {
    return lightness < 0.40 ? "Muted Forest Green" : "Muted Sage";
  }

  if (
    hue >= 78 && hue < 105 &&
    saturation >= 0.075 &&
    lightness >= 0.16 && lightness <= 0.58 &&
    chromaMagnitude >= 8 &&
    greenLead >= 6
  ) {
    return lightness < 0.38 ? "Muted Olive Green" : "Muted Olive";
  }

  return null;
}

'''
if anchor not in s:
    raise SystemExit('helper insertion anchor not found')
s=s.replace(anchor,helper+anchor,1)
old='''  const chromaMagnitude = getChromaMagnitudeFromLab(getLab(safe));

  if (isDarkOliveFamily(safe)) return "Deep Olive";'''
new='''  const chromaMagnitude = getChromaMagnitudeFromLab(getLab(safe));
  const directionalChromaticIdentity = getDirectionalChromaticIdentity(safe);

  if (isDarkOliveFamily(safe)) return "Deep Olive";
  if (directionalChromaticIdentity) return directionalChromaticIdentity;'''
if old not in s:
    raise SystemExit('getColorName insertion anchor not found')
s=s.replace(old,new,1)
p.write_text(s)
