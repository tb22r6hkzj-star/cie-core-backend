import { useState } from "react";
import * as ImagePicker from "expo-image-picker";
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { analyzeOutfit } from "./src/api/visioncore";
import { AnalysisSections } from "./src/components/AnalysisSections";
import { BottomNav, type AppTab } from "./src/components/BottomNav";
import { BrandHeader } from "./src/components/BrandHeader";
import { theme } from "./src/theme";
import type { AnalysisResult } from "./src/types/analysis";

type SelectedImage = { uri: string; mimeType?: string | null; fileName?: string | null };

const PROGRESS_COPY = ["Locating outfit pieces", "Measuring owned colors", "Building your Head-to-Toe breakdown"] as const;

function Dashboard({ onAnalyze, latest }: { onAnalyze: () => void; latest: AnalysisResult | null }) {
  return (
    <View style={styles.screenBody}>
      <View style={styles.hero}>
        <View style={styles.powerBadge}><Text style={styles.powerBadgeText}>✦  POWERED BY VISIONCORE</Text></View>
        <Text style={styles.title}>Color intelligence for your <Text style={styles.gradientWord}>wardrobe.</Text></Text>
        <Text style={styles.subtitle}>Understand every piece, every color relationship, and the strongest direction for your complete look.</Text>
      </View>
      <Pressable style={styles.primaryCta} onPress={onAnalyze}><Text style={styles.primaryCtaText}>Analyze an Outfit  →</Text></Pressable>
      <View style={styles.featureRow}>
        <View style={styles.feature}><Text style={styles.featureIcon}>ϟ</Text><Text style={styles.featureText}>AI-powered analysis</Text></View>
        <View style={styles.feature}><Text style={styles.featureIcon}>◇</Text><Text style={styles.featureText}>Evidence-led results</Text></View>
      </View>
      <View style={styles.stepsBlock}>
        <Text style={styles.blockTitle}>How it works</Text>
        {["Upload a full outfit", "VisionCore measures each piece", "Apply your color direction"].map((label, index) => (
          <View key={label} style={styles.stepCard}><View style={styles.stepNumber}><Text style={styles.stepNumberText}>{index + 1}</Text></View><View><Text style={styles.stepTitle}>{label}</Text><Text style={styles.stepCopy}>{index === 0 ? "Use your camera or choose a photo." : index === 1 ? "Identity and owned color evidence stay synchronized." : "Review modes, reasoning, and matched pieces."}</Text></View></View>
        ))}
      </View>
      {latest ? <View style={styles.latestCard}><View><Text style={styles.latestEyebrow}>LATEST ANALYSIS</Text><Text style={styles.latestTitle}>{latest.bestMode || "Complete look"}</Text><Text style={styles.latestMeta}>{latest.zones.length} pieces · Score {Math.round(latest.outfitScore)}</Text></View><View style={[styles.latestSwatch, { backgroundColor: latest.dominantHex || theme.colors.surfaceRaised }]} /></View> : null}
    </View>
  );
}

function UploadScreen({ image, loading, progressCopy, onSelect, onAnalyze }: { image: SelectedImage | null; loading: boolean; progressCopy: string; onSelect: (source: "camera" | "library") => void; onAnalyze: () => void }) {
  return (
    <View style={styles.screenBody}>
      <View style={styles.pageHeading}><Text style={styles.eyebrow}>NEW ANALYSIS</Text><Text style={styles.pageTitle}>Upload your look</Text><Text style={styles.subtitle}>For the best read, include your outfit from shoulders to shoes in clear lighting.</Text></View>
      {image ? <Image source={{ uri: image.uri }} style={styles.preview} resizeMode="cover" /> : <View style={styles.emptyPreview}><Text style={styles.emptyIcon}>⇧</Text><Text style={styles.emptyTitle}>Full outfit photo</Text><Text style={styles.emptyText}>Your photo is analyzed securely and used to build your color intelligence.</Text></View>}
      <View style={styles.buttonRow}>
        <Pressable style={styles.secondaryButton} onPress={() => onSelect("camera")} disabled={loading}><Text style={styles.secondaryButtonIcon}>◎</Text><Text style={styles.secondaryButtonText}>Take Photo</Text></Pressable>
        <Pressable style={styles.secondaryButton} onPress={() => onSelect("library")} disabled={loading}><Text style={styles.secondaryButtonIcon}>▧</Text><Text style={styles.secondaryButtonText}>Choose Photo</Text></Pressable>
      </View>
      {image ? <Pressable style={[styles.analyzeButton, loading && styles.disabled]} onPress={onAnalyze} disabled={loading}>{loading ? <ActivityIndicator color={theme.colors.background} /> : <Text style={styles.analyzeText}>Analyze Outfit</Text>}</Pressable> : null}
      {loading ? <View style={styles.progress}><ActivityIndicator color={theme.colors.cyan} /><View style={styles.progressCopy}><Text style={styles.progressTitle}>{progressCopy}</Text><Text style={styles.progressText}>VisionCore is checking piece identity and owned color evidence. This may take about a minute.</Text></View></View> : null}
      <View style={styles.photoTips}><Text style={styles.photoTipsTitle}>PHOTO GUIDANCE</Text><Text style={styles.photoTip}>• Keep the complete outfit visible</Text><Text style={styles.photoTip}>• Use bright, even lighting</Text><Text style={styles.photoTip}>• Avoid heavy filters or color effects</Text></View>
    </View>
  );
}

function HistoryScreen({ latest, onOpen }: { latest: AnalysisResult | null; onOpen: () => void }) {
  return <View style={styles.screenBody}><View style={styles.pageHeading}><Text style={styles.eyebrow}>YOUR ARCHIVE</Text><Text style={styles.pageTitle}>Analysis History</Text><Text style={styles.subtitle}>Return to saved looks without spending another analysis run.</Text></View>{latest ? <Pressable style={styles.historyCard} onPress={onOpen}><View style={[styles.historySwatch, { backgroundColor: latest.dominantHex || theme.colors.surfaceRaised }]} /><View style={styles.historyCopy}><Text style={styles.historyTitle}>{latest.dominantName || "Outfit Analysis"}</Text><Text style={styles.historyMeta}>{latest.zones.length} detected pieces · {latest.bestMode || "Analyzed"}</Text></View><Text style={styles.historyArrow}>›</Text></Pressable> : <View style={styles.emptyState}><Text style={styles.emptyIcon}>◷</Text><Text style={styles.emptyTitle}>No saved analyses yet</Text><Text style={styles.emptyText}>Your completed VisionCore results will appear here.</Text></View>}</View>;
}

function AccountScreen() {
  return <View style={styles.screenBody}><View style={styles.pageHeading}><Text style={styles.eyebrow}>PROFILE</Text><Text style={styles.pageTitle}>Your Account</Text><Text style={styles.subtitle}>Manage your VisionCore plan, runs, and app preferences.</Text></View><View style={styles.planCard}><View style={styles.planTop}><View><Text style={styles.planLabel}>CURRENT PLAN</Text><Text style={styles.planName}>Essential</Text></View><Text style={styles.planPrice}>$7.99<Text style={styles.planPeriod}>/mo</Text></Text></View><View style={styles.usageTrack}><View style={styles.usageFill} /></View><View style={styles.usageRow}><Text style={styles.usageText}>20 analyses remaining</Text><Text style={styles.usageText}>20 monthly</Text></View></View>{["Personal information", "Analysis preferences", "Notifications", "Privacy and data", "Help and support"].map((item) => <Pressable key={item} style={styles.settingRow}><Text style={styles.settingText}>{item}</Text><Text style={styles.settingArrow}>›</Text></Pressable>)}<Text style={styles.betaNotice}>Private beta · VisionCore mobile 0.1.0</Text></View>;
}

export default function App() {
  const [tab, setTab] = useState<AppTab>("dashboard");
  const [image, setImage] = useState<SelectedImage | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [loading, setLoading] = useState(false);
  const [progressIndex, setProgressIndex] = useState(0);
  const progressCopy = PROGRESS_COPY[progressIndex] ?? PROGRESS_COPY[0];

  function changeTab(next: AppTab) {
    setTab(next);
    setShowResult(false);
  }

  async function selectImage(source: "camera" | "library") {
    const permission = source === "camera" ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return Alert.alert("Permission needed", `Allow ${source === "camera" ? "camera" : "photo library"} access to analyze an outfit.`);
    const picker = source === "camera" ? ImagePicker.launchCameraAsync : ImagePicker.launchImageLibraryAsync;
    const selected = await picker({ mediaTypes: ["images"], quality: 0.88 });
    if (selected.canceled) return;
    const asset = selected.assets[0];
    if (!asset) return;
    setImage({ uri: asset.uri, mimeType: asset.mimeType, fileName: asset.fileName });
  }

  async function runAnalysis() {
    if (!image || loading) return;
    setLoading(true);
    setProgressIndex(0);
    const timer = setInterval(() => setProgressIndex((current) => Math.min(current + 1, PROGRESS_COPY.length - 1)), 12_000);
    try {
      setResult(await analyzeOutfit(image));
      setShowResult(true);
    } catch (error) {
      Alert.alert("Analysis unavailable", error instanceof Error ? error.message : "Please try again.");
    } finally {
      clearInterval(timer);
      setLoading(false);
    }
  }

  function shoppingTarget(target: string) {
    Alert.alert(`${target} selected`, "Color-matched product recommendations are the next private-beta connection.");
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="light" />
        <View style={styles.shell}>
          <BrandHeader onPressAccount={() => changeTab("account")} />
          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            {showResult && result ? <View style={styles.screenBody}><View style={styles.resultHeading}><Pressable onPress={() => setShowResult(false)}><Text style={styles.back}>‹  Back</Text></Pressable><Text style={styles.resultTitle}>Your Color Intelligence</Text><Text style={styles.subtitle}>A complete evidence-led read of your outfit.</Text></View>{image ? <Image source={{ uri: image.uri }} style={styles.resultImage} resizeMode="cover" /> : null}<AnalysisSections result={result} onShoppingTarget={shoppingTarget} /></View> : tab === "dashboard" ? <Dashboard onAnalyze={() => changeTab("analyze")} latest={result} /> : tab === "analyze" ? <UploadScreen image={image} loading={loading} progressCopy={progressCopy} onSelect={selectImage} onAnalyze={runAnalysis} /> : tab === "history" ? <HistoryScreen latest={result} onOpen={() => setShowResult(true)} /> : <AccountScreen />}
          </ScrollView>
          <BottomNav active={tab} onChange={changeTab} />
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: theme.colors.background, flex: 1 },
  shell: { flex: 1, gap: 12, paddingHorizontal: 18, paddingTop: 8 },
  content: { paddingBottom: 42 },
  screenBody: { gap: 24, paddingTop: 18 },
  hero: { alignItems: "center", gap: 13, paddingHorizontal: 8, paddingTop: 28 },
  powerBadge: { backgroundColor: "rgba(39,213,240,0.08)", borderColor: "rgba(39,213,240,0.28)", borderRadius: 99, borderWidth: 1, paddingHorizontal: 13, paddingVertical: 8 },
  powerBadgeText: { color: theme.colors.cyan, fontSize: 10, fontWeight: "800", letterSpacing: 1.2 },
  title: { color: theme.colors.text, fontSize: 39, fontWeight: "900", letterSpacing: -1.4, lineHeight: 44, textAlign: "center" },
  gradientWord: { color: theme.colors.cyan },
  subtitle: { color: theme.colors.muted, fontSize: 16, lineHeight: 24 },
  primaryCta: { alignItems: "center", backgroundColor: theme.colors.cyan, borderRadius: 17, marginHorizontal: 22, padding: 17 },
  primaryCtaText: { color: theme.colors.background, fontSize: 16, fontWeight: "800" },
  featureRow: { flexDirection: "row", justifyContent: "center", gap: 20 },
  feature: { alignItems: "center", flexDirection: "row", gap: 6 },
  featureIcon: { color: theme.colors.cyan, fontSize: 16 },
  featureText: { color: theme.colors.muted, fontSize: 11 },
  stepsBlock: { gap: 13, marginTop: 12 },
  blockTitle: { color: theme.colors.text, fontSize: 24, fontWeight: "800", textAlign: "center" },
  stepCard: { alignItems: "center", backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderRadius: 20, borderWidth: 1, flexDirection: "row", gap: 15, padding: 18 },
  stepNumber: { alignItems: "center", backgroundColor: theme.colors.cyan, borderRadius: 15, height: 30, justifyContent: "center", width: 30 },
  stepNumberText: { color: theme.colors.background, fontWeight: "900" },
  stepTitle: { color: theme.colors.text, fontSize: 16, fontWeight: "700" },
  stepCopy: { color: theme.colors.muted, fontSize: 12, marginTop: 4 },
  latestCard: { alignItems: "center", backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderRadius: 22, borderWidth: 1, flexDirection: "row", justifyContent: "space-between", padding: 20 },
  latestEyebrow: { color: theme.colors.cyan, fontSize: 9, fontWeight: "800", letterSpacing: 1.5 },
  latestTitle: { color: theme.colors.text, fontSize: 20, fontWeight: "800", marginTop: 5 },
  latestMeta: { color: theme.colors.muted, fontSize: 12, marginTop: 4 },
  latestSwatch: { borderColor: "rgba(255,255,255,0.18)", borderRadius: 18, borderWidth: 1, height: 58, width: 58 },
  pageHeading: { gap: 8 },
  eyebrow: { color: theme.colors.cyan, fontSize: 11, fontWeight: "800", letterSpacing: 2.2 },
  pageTitle: { color: theme.colors.text, fontSize: 34, fontWeight: "800", letterSpacing: -1 },
  preview: { aspectRatio: 0.74, backgroundColor: theme.colors.surface, borderRadius: theme.radius.large, width: "100%" },
  emptyPreview: { alignItems: "center", aspectRatio: 1.1, backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderRadius: theme.radius.large, borderStyle: "dashed", borderWidth: 1, justifyContent: "center", padding: 35 },
  emptyIcon: { color: theme.colors.cyan, fontSize: 46 },
  emptyTitle: { color: theme.colors.text, fontSize: 21, fontWeight: "700", marginTop: 10 },
  emptyText: { color: theme.colors.muted, fontSize: 14, lineHeight: 21, marginTop: 7, textAlign: "center" },
  buttonRow: { flexDirection: "row", gap: 11 },
  secondaryButton: { alignItems: "center", backgroundColor: theme.colors.surfaceRaised, borderColor: theme.colors.border, borderRadius: theme.radius.medium, borderWidth: 1, flex: 1, gap: 4, padding: 15 },
  secondaryButtonIcon: { color: theme.colors.cyan, fontSize: 20 },
  secondaryButtonText: { color: theme.colors.text, fontSize: 14, fontWeight: "700" },
  analyzeButton: { alignItems: "center", backgroundColor: theme.colors.cyan, borderRadius: theme.radius.medium, minHeight: 56, justifyContent: "center", padding: 17 },
  analyzeText: { color: theme.colors.background, fontSize: 17, fontWeight: "800" },
  disabled: { opacity: 0.65 },
  progress: { alignItems: "center", backgroundColor: theme.colors.surface, borderRadius: theme.radius.medium, flexDirection: "row", gap: 15, padding: 20 },
  progressCopy: { flex: 1 },
  progressTitle: { color: theme.colors.text, fontSize: 16, fontWeight: "700" },
  progressText: { color: theme.colors.muted, fontSize: 13, lineHeight: 19, marginTop: 4 },
  photoTips: { backgroundColor: "rgba(39,213,240,0.05)", borderRadius: 18, gap: 7, padding: 18 },
  photoTipsTitle: { color: theme.colors.cyan, fontSize: 10, fontWeight: "800", letterSpacing: 1.7 },
  photoTip: { color: theme.colors.muted, fontSize: 13 },
  resultHeading: { gap: 8 },
  back: { color: theme.colors.cyan, fontSize: 14, fontWeight: "700", marginBottom: 5 },
  resultTitle: { color: theme.colors.text, fontSize: 32, fontWeight: "800", letterSpacing: -0.8 },
  resultImage: { aspectRatio: 1.1, borderRadius: theme.radius.large, width: "100%" },
  historyCard: { alignItems: "center", backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderRadius: 22, borderWidth: 1, flexDirection: "row", gap: 14, padding: 17 },
  historySwatch: { borderRadius: 14, height: 54, width: 54 },
  historyCopy: { flex: 1 },
  historyTitle: { color: theme.colors.text, fontSize: 17, fontWeight: "700" },
  historyMeta: { color: theme.colors.muted, fontSize: 12, marginTop: 4 },
  historyArrow: { color: theme.colors.cyan, fontSize: 26 },
  emptyState: { alignItems: "center", backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderRadius: theme.radius.large, borderWidth: 1, padding: 42 },
  planCard: { backgroundColor: theme.colors.surface, borderColor: "rgba(39,213,240,0.28)", borderRadius: theme.radius.large, borderWidth: 1, gap: 18, padding: 22 },
  planTop: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  planLabel: { color: theme.colors.cyan, fontSize: 9, fontWeight: "800", letterSpacing: 1.5 },
  planName: { color: theme.colors.text, fontSize: 24, fontWeight: "800", marginTop: 4 },
  planPrice: { color: theme.colors.text, fontSize: 24, fontWeight: "800" },
  planPeriod: { color: theme.colors.muted, fontSize: 12, fontWeight: "500" },
  usageTrack: { backgroundColor: theme.colors.surfaceRaised, borderRadius: 5, height: 8, overflow: "hidden" },
  usageFill: { backgroundColor: theme.colors.mint, height: "100%", width: "100%" },
  usageRow: { flexDirection: "row", justifyContent: "space-between" },
  usageText: { color: theme.colors.muted, fontSize: 11 },
  settingRow: { alignItems: "center", borderBottomColor: theme.colors.border, borderBottomWidth: 1, flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 4, paddingVertical: 18 },
  settingText: { color: theme.colors.text, fontSize: 15, fontWeight: "600" },
  settingArrow: { color: theme.colors.muted, fontSize: 24 },
  betaNotice: { color: theme.colors.muted, fontSize: 11, paddingVertical: 12, textAlign: "center" }
});
