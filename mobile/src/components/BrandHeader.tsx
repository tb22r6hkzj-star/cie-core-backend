import { Pressable, StyleSheet, Text, View } from "react-native";
import { theme } from "../theme";

type Props = {
  runsRemaining?: number;
  onPressAccount?: () => void;
};

export function BrandHeader({ runsRemaining = 20, onPressAccount }: Props) {
  return (
    <View style={styles.header}>
      <View>
        <Text style={styles.logo}>CE<Text style={styles.hyphen}>-</Text>CE</Text>
        <Text style={styles.powered}>POWERED BY VISIONCORE</Text>
      </View>
      <Pressable style={styles.account} onPress={onPressAccount} accessibilityLabel="Open account">
        <Text style={styles.runs}>{runsRemaining}</Text>
        <Text style={styles.runsLabel}>RUNS</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  logo: { color: theme.colors.text, fontSize: 26, fontWeight: "900", letterSpacing: -1.5 },
  hyphen: { color: theme.colors.cyan },
  powered: { color: theme.colors.muted, fontSize: 7, fontWeight: "700", letterSpacing: 1.7, marginTop: -2 },
  account: { alignItems: "center", backgroundColor: theme.colors.surfaceRaised, borderColor: theme.colors.border, borderRadius: 16, borderWidth: 1, minWidth: 58, paddingHorizontal: 12, paddingVertical: 8 },
  runs: { color: theme.colors.cyan, fontSize: 16, fontWeight: "800" },
  runsLabel: { color: theme.colors.muted, fontSize: 8, fontWeight: "800", letterSpacing: 1 }
});
