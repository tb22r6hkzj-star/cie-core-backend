import { Pressable, StyleSheet, Text, View } from "react-native";
import { theme } from "../theme";

export type AppTab = "dashboard" | "analyze" | "history" | "account";

const ITEMS: Array<{ tab: AppTab; icon: string; label: string }> = [
  { tab: "dashboard", icon: "⌂", label: "Home" },
  { tab: "analyze", icon: "＋", label: "Analyze" },
  { tab: "history", icon: "◷", label: "History" },
  { tab: "account", icon: "○", label: "Account" }
];

type Props = { active: AppTab; onChange: (tab: AppTab) => void };

export function BottomNav({ active, onChange }: Props) {
  return (
    <View style={styles.nav} accessibilityRole="tablist">
      {ITEMS.map((item) => {
        const selected = item.tab === active;
        return (
          <Pressable key={item.tab} style={styles.item} onPress={() => onChange(item.tab)} accessibilityRole="tab" accessibilityState={{ selected }}>
            <Text style={[styles.icon, selected && styles.selected]}>{item.icon}</Text>
            <Text style={[styles.label, selected && styles.selected]}>{item.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  nav: { backgroundColor: "#0D192B", borderColor: theme.colors.border, borderRadius: 24, borderWidth: 1, flexDirection: "row", justifyContent: "space-around", paddingHorizontal: 8, paddingVertical: 10 },
  item: { alignItems: "center", flex: 1, gap: 2, paddingVertical: 2 },
  icon: { color: theme.colors.muted, fontSize: 22, fontWeight: "600" },
  label: { color: theme.colors.muted, fontSize: 10, fontWeight: "700" },
  selected: { color: theme.colors.cyan }
});
