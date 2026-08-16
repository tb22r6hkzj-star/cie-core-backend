from pathlib import Path

path = Path('src/server.js')
text = path.read_text()

old = '''        : buildGarmentColorProfile({
            zoneKey,
            mode,
            dominantColor,
            supportColors,
            accentColors,
          })
    ),
    _debug: debugContext,
'''
new = '''        : buildGarmentColorProfile({
            zoneKey,
            mode,
            dominantColor,
            supportColors,
            accentColors,
          })
    ),
    ...(isAccessoryDisplayPaletteZone(zoneKey) ? {
      primary_color: explainabilityPrimary,
      secondary_colors: accessoryDisplayRoles?.secondary || [],
      accent_colors: accessoryDisplayRoles?.accent || [],
      detected_colors: explainabilityPublishedColors,
      region_colors: explainabilityPublishedColors,
      display_palette: calibratedDisplayPalette,
    } : {}),
    _debug: debugContext,
'''
if new in text:
    raise SystemExit(0)
if old not in text:
    raise SystemExit('final return anchor missing')
path.write_text(text.replace(old, new, 1))
