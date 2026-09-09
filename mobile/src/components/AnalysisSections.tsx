import { Pressable, StyleSheet, Text, View } from "react-native";
import type { AnalysisResult, ModeResult } from "../types/analysis";
import { theme } from "../theme";
import { ZoneCard } from "./ZoneCard";

function SectionTitle({ accent, title, meta }: { accent: string; title: string; meta?: string }) {
  return <View style={styles.sectionHeading}><View style={[styles.sectionAccent, { backgroundColor: accent }]} /><Text style={styles.sectionTitle}>{title}</Text>{meta ? <Text style={styles.sectionMeta}>{meta}</Text> : null}</View>;
}

function ScoreOverview({ result }: { result: AnalysisResult }) {
  return (
    <View style={styles.scoreCard}>
      <View style={styles.scoreTop}>
        <View><Text style={styles.kicker}>OUTFIT INTELLIGENCE</Text><Text style={styles.scoreTitle}>Overall Score</Text></View>
        <View style={styles.scoreRing}><Text style={styles.scoreValue}>{Math.round(result.outfitScore)}</Text></View>
      </View>
      <View style={styles.metrics}>
        {result.scoreBreakdown.map((metric) => (
          <View key={metric.label} style={styles.metric}>
            <Text style={styles.metricLabel}>{metric.label}</Text>
            <View style={styles.metricTrack}><View style={[styles.metricFill, { width: `${Math.max(3, metric.value)}%` }]} /></View>
            <Text style={styles.metricValue}>{Math.round(metric.value)}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function InsightCard({ type, text }: { type: "why" | "adjustment"; text: string }) {
  const adjustment = type === "adjustment";
  return (
    <View style={[styles.insightCard, adjustment && styles.adjustmentCard]}>
      <View style={styles.insightHeading}><View style={[styles.insightIcon, adjustment && styles.adjustmentIcon]}><Text style={[styles.insightGlyph, adjustment && styles.adjustmentGlyph]}>{adjustment ? "◉" : "✦"}</Text></View><View><Text style={[styles.insightTitle, adjustment && styles.adjustmentTitle]}>{adjustment ? "Suggested Adjustment" : "Why This Works"}</Text>{!adjustment ? <Text style={styles.insightSubtitle}>AI-powered color intelligence insight</Text> : null}</View></View>
      <Text style={[styles.insightText, adjustment && styles.adjustmentText]}>{text}</Text>
    </View>
  );
}

function ModeCard({ mode, best }: { mode: ModeResult; best: boolean }) {
  return (
    <View style={[styles.modeCard, best && styles.bestModeCard]}>
      <View style={styles.modeTop}><View><View style={styles.modeNameRow}><Text style={styles.modeName}>{mode.mode}</Text>{best ? <View style={styles.bestBadge}><Text style={styles.bestText}>★ BEST</Text></View> : null}</View>{mode.reason ? <Text style={styles.modeReason}>{mode.reason}</Text> : null}</View><Text style={[styles.modeScore, best && styles.bestModeScore]}>{mode.score.toFixed(2)}</Text></View>
      <View style={styles.paletteRow}>{mode.colors.slice(0, 5).map((color, index) => <View key={`${color.hex}-${index}`} style={[styles.paletteColor, { backgroundColor: color.hex || theme.colors.surfaceRaised }]} />)}</View>
    </View>
  );
}

const SHOPPING_TARGETS = ["Jacket", "Shirt", "Sweater", "Hoodie", "Pants", "Shorts", "Shoes", "Accessories"];

export function AnalysisSections({ result, onShoppingTarget }: { result: AnalysisResult; onShoppingTarget: (target: string) => void }) {
  const uncertainCount = result.zones.filter((zone) => zone.colorWithheld).length;
  return (
    <View style={styles.sections}>
      <ScoreOverview result={result} />
      {result.whyThisWorks ? <InsightCard type="why" text={result.whyThisWorks} /> : null}
      {result.suggestedAdjustment ? <InsightCard type="adjustment" text={result.suggestedAdjustment} /> : null}

      <View style={styles.sectionBlock}>
        <SectionTitle accent={theme.colors.violet} title="Head-to-Toe Garment Breakdown" meta={`${result.zones.length} detected${uncertainCount ? ` + ${uncertainCount} uncertain` : ""}`} />
        <View style={styles.cardList}>{result.zones.map((zone) => <ZoneCard key={zone.key} zone={zone} />)}</View>
      </View>

      {result.modes.length ? <View style={styles.sectionBlock}><SectionTitle accent={theme.colors.amber} title="Style Modes" meta={`${result.modes.length} analyzed`} /><View style={styles.cardList}>{result.modes.map((mode) => <ModeCard key={mode.mode} mode={mode} best={mode.mode.toLowerCase() === result.bestMode?.toLowerCase()} />)}</View></View> : null}

      <View style={styles.sectionBlock}>
        <View style={styles.assistDivider}><View style={styles.dividerLine} /><View style={styles.assistBadge}><Text style={styles.assistBadgeText}>▢  Shopping Assist</Text></View><View style={styles.dividerLine} /></View>
        <View style={styles.shoppingCard}>
          <Text style={styles.shoppingTitle}>What piece are you looking for?</Text>
          <Text style={styles.shoppingSubtitle}>Select a target item to get color-matched recommendations</Text>
          <View style={styles.shoppingGrid}>{SHOPPING_TARGETS.map((target) => <Pressable key={target} style={styles.shoppingTarget} onPress={() => onShoppingTarget(target)}><Text style={styles.targetIcon}>◇</Text><Text style={styles.targetLabel}>{target}</Text></Pressable>)}</View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sections: { gap: 26 },
  sectionBlock: { gap: 15 },
  sectionHeading: { alignItems: "center", flexDirection: "row", gap: 10 },
  sectionAccent: { borderRadius: 5, height: 36, width: 5 },
  sectionTitle: { color: theme.colors.text, flex: 1, fontSize: 21, fontWeight: "800" },
  sectionMeta: { color: theme.colors.muted, fontSize: 12 },
  cardList: { gap: 14 },
  scoreCard: { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderRadius: theme.radius.large, borderWidth: 1, gap: 22, padding: 22 },
  scoreTop: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  kicker: { color: theme.colors.cyan, fontSize: 10, fontWeight: "800", letterSpacing: 2 },
  scoreTitle: { color: theme.colors.text, fontSize: 25, fontWeight: "800", marginTop: 5 },
  scoreRing: { alignItems: "center", borderColor: theme.colors.cyan, borderRadius: 40, borderWidth: 6, height: 78, justifyContent: "center", width: 78 },
  scoreValue: { color: theme.colors.text, fontSize: 25, fontWeight: "900" },
  metrics: { gap: 12 },
  metric: { alignItems: "center", flexDirection: "row", gap: 10 },
  metricLabel: { color: theme.colors.muted, fontSize: 13, width: 84 },
  metricTrack: { backgroundColor: theme.colors.surfaceRaised, borderRadius: 4, flex: 1, height: 7, overflow: "hidden" },
  metricFill: { backgroundColor: theme.colors.mint, borderRadius: 4, height: "100%" },
  metricValue: { color: theme.colors.mint, fontSize: 13, fontWeight: "700", textAlign: "right", width: 28 },
  insightCard: { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderRadius: theme.radius.large, borderWidth: 1, gap: 20, padding: 22 },
  adjustmentCard: { backgroundColor: "rgba(88,67,28,0.25)", borderColor: "rgba(249,200,70,0.28)" },
  insightHeading: { alignItems: "center", flexDirection: "row", gap: 14 },
  insightIcon: { alignItems: "center", backgroundColor: "rgba(39,213,240,0.12)", borderRadius: 14, height: 48, justifyContent: "center", width: 48 },
  adjustmentIcon: { backgroundColor: "rgba(249,200,70,0.12)" },
  insightGlyph: { color: theme.colors.cyan, fontSize: 22 },
  adjustmentGlyph: { color: theme.colors.amber },
  insightTitle: { color: theme.colors.text, fontSize: 19, fontWeight: "800" },
  adjustmentTitle: { color: theme.colors.amber },
  insightSubtitle: { color: theme.colors.muted, fontSize: 11, marginTop: 3 },
  insightText: { color: "#D8E0EC", fontSize: 17, lineHeight: 27 },
  adjustmentText: { color: "#D8C88F" },
  modeCard: { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderRadius: theme.radius.large, borderWidth: 1, gap: 18, padding: 20 },
  bestModeCard: { backgroundColor: "rgba(30,64,58,0.48)", borderColor: "rgba(61,214,164,0.35)" },
  modeTop: { alignItems: "flex-start", flexDirection: "row", gap: 12, justifyContent: "space-between" },
  modeNameRow: { alignItems: "center", flexDirection: "row", gap: 8 },
  modeName: { color: theme.colors.text, fontSize: 20, fontWeight: "800" },
  bestBadge: { backgroundColor: "rgba(249,200,70,0.14)", borderColor: "rgba(249,200,70,0.45)", borderRadius: 99, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 4 },
  bestText: { color: theme.colors.amber, fontSize: 10, fontWeight: "900" },
  modeReason: { color: theme.colors.muted, fontSize: 13, lineHeight: 19, marginTop: 7, maxWidth: 245 },
  modeScore: { color: theme.colors.violet, fontSize: 24, fontWeight: "800" },
  bestModeScore: { color: theme.colors.mint },
  paletteRow: { flexDirection: "row", gap: 8 },
  paletteColor: { borderColor: "rgba(255,255,255,0.15)", borderRadius: 10, borderWidth: 1, flex: 1, height: 42 },
  assistDivider: { alignItems: "center", flexDirection: "row", gap: 12 },
  dividerLine: { backgroundColor: "rgba(155,114,255,0.22)", flex: 1, height: 1 },
  assistBadge: { backgroundColor: "rgba(155,114,255,0.13)", borderColor: "rgba(155,114,255,0.35)", borderRadius: 99, borderWidth: 1, paddingHorizontal: 15, paddingVertical: 8 },
  assistBadgeText: { color: "#D6C3FF", fontSize: 13, fontWeight: "700" },
  shoppingCard: { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderRadius: theme.radius.large, borderWidth: 1, padding: 20 },
  shoppingTitle: { color: theme.colors.text, fontSize: 20, fontWeight: "800" },
  shoppingSubtitle: { color: theme.colors.muted, fontSize: 14, lineHeight: 20, marginTop: 4 },
  shoppingGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 18 },
  shoppingTarget: { alignItems: "center", backgroundColor: "#0E1A2F", borderRadius: 16, gap: 7, padding: 16, width: "48%" },
  targetIcon: { color: theme.colors.violet, fontSize: 23 },
  targetLabel: { color: theme.colors.text, fontSize: 14, fontWeight: "600" }
});
