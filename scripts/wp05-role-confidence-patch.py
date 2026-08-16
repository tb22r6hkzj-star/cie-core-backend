from pathlib import Path

path = Path('src/server.js')
text = path.read_text()
old = '''  const accessoryDisplayRoles = calibratedDisplayPalette.length
    ? splitAccessoryDetectedPaletteRoles(calibratedDisplayPalette)
    : null;
  const contaminationScore = buildContaminationEvidenceScore({
'''
new = '''  const compactAccessoryDisplayRoles = calibratedDisplayPalette.length
    ? splitAccessoryDetectedPaletteRoles(calibratedDisplayPalette)
    : null;
  const accessoryDisplayRoles = compactAccessoryDisplayRoles
    ? {
        primary: withDisplayColorConfidence(compactAccessoryDisplayRoles.primary, {
          zoneConfidence,
          sourceConfidence: explainabilitySourceConfidence,
          evidenceWeight: displayEvidenceWeight,
        }),
        secondary: (compactAccessoryDisplayRoles.secondary || []).map((color) => withDisplayColorConfidence(color, {
          zoneConfidence,
          sourceConfidence: explainabilitySourceConfidence,
          evidenceWeight: displayEvidenceWeight,
        })),
        accent: (compactAccessoryDisplayRoles.accent || []).map((color) => withDisplayColorConfidence(color, {
          zoneConfidence,
          sourceConfidence: explainabilitySourceConfidence,
          evidenceWeight: displayEvidenceWeight,
        })),
      }
    : null;
  const contaminationScore = buildContaminationEvidenceScore({
'''
if new in text:
    raise SystemExit(0)
if old not in text:
    raise SystemExit('role confidence anchor missing')
path.write_text(text.replace(old, new, 1))
