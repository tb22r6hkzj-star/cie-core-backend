import { StyleSheet, Text, View } from "react-native";
import type { DisplayZone } from "../types/analysis";
import { theme } from "../theme";

type Props = { zone: DisplayZone };

export function ZoneCard({ zone }: Props) {
  return (
    <View style={styles.card} accessibilityLabel={`${zone.pieceLabel} analysis`}>
      <View style={styles.header}>
        <Text style={styles.piece}>{zone.pieceLabel.toUpperCase()}</Text>
        <View style={styles.score}><Text style={styles.scoreText}>{zone.confidence}</Text></View>
      </View>
      <View style={styles.identityRow}>
        <View style={[styles.swatch, zone.hex ? { backgroundColor: zone.hex } : styles.unknownSwatch]} />
        <View style={styles.identityCopy}>
          <Text style={styles.colorName}>{zone.colorName || zone.pieceLabel}</Text>
          <Text style={styles.translation}>
            {zone.colorWithheld ? "Color not confidently measured" : zone.colorTranslation || zone.hex}
          </Text>
          {zone.hex ? <Text style={styles.hex}>{zone.hex.toUpperCase()}</Text> : null}
        </View>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${Math.max(4, zone.confidence)}%` }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderRadius: theme.radius.large, borderWidth: 1, padding: 22, gap: 22 },
  header: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  piece: { color: theme.colors.muted, fontSize: 14, fontWeight: "700", letterSpacing: 2.2 },
  score: { alignItems: "center", borderColor: theme.colors.cyan, borderRadius: 24, borderWidth: 4, height: 48, justifyContent: "center", width: 48 },
  scoreText: { color: theme.colors.text, fontSize: 17, fontWeight: "800" },
  identityRow: { alignItems: "center", flexDirection: "row", gap: 18 },
  swatch: { borderColor: "rgba(255,255,255,0.16)", borderRadius: 18, borderWidth: 1, height: 82, width: 82 },
  unknownSwatch: { backgroundColor: "transparent", borderColor: theme.colors.border, borderStyle: "dashed" },
  identityCopy: { flex: 1, gap: 5 },
  colorName: { color: theme.colors.text, fontSize: 22, fontWeight: "700" },
  translation: { color: theme.colors.muted, fontSize: 15, fontStyle: "italic" },
  hex: { color: theme.colors.muted, fontSize: 15, letterSpacing: 0.8 },
  track: { backgroundColor: theme.colors.surfaceRaised, borderRadius: 5, height: 7, overflow: "hidden" },
  fill: { backgroundColor: theme.colors.mint, borderRadius: 5, height: "100%" }
});
