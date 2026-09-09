import { useMemo, useState } from "react";
import * as ImagePicker from "expo-image-picker";
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { analyzeOutfit } from "./src/api/visioncore";
import { ZoneCard } from "./src/components/ZoneCard";
import { theme } from "./src/theme";
import type { DisplayZone } from "./src/types/analysis";

type SelectedImage = { uri: string; mimeType?: string | null; fileName?: string | null };

const PROGRESS_COPY = ["Locating outfit pieces", "Measuring owned colors", "Building your Head-to-Toe breakdown"];

export default function App() {
  const [image, setImage] = useState<SelectedImage | null>(null);
  const [zones, setZones] = useState<DisplayZone[]>([]);
  const [loading, setLoading] = useState(false);
  const [progressIndex, setProgressIndex] = useState(0);
  const hasResults = zones.length > 0;
  const progressCopy = useMemo(() => PROGRESS_COPY[progressIndex] || PROGRESS_COPY[0], [progressIndex]);

  async function selectImage(source: "camera" | "library") {
    const permission = source === "camera"
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission needed", `Allow ${source === "camera" ? "camera" : "photo library"} access to analyze an outfit.`);
      return;
    }
    const result = source === "camera"
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.88 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.88 });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset) return;
    setImage({ uri: asset.uri, mimeType: asset.mimeType, fileName: asset.fileName });
    setZones([]);
  }

  async function runAnalysis() {
    if (!image || loading) return;
    setLoading(true);
    setProgressIndex(0);
    const progressTimer = setInterval(() => setProgressIndex((current) => Math.min(current + 1, PROGRESS_COPY.length - 1)), 12_000);
    try {
      setZones(await analyzeOutfit(image));
    } catch (error) {
      Alert.alert("Analysis unavailable", error instanceof Error ? error.message : "Please try again.");
    } finally {
      clearInterval(progressTimer);
      setLoading(false);
    }
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="light" />
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.brandRow}>
            <View style={styles.brandMark}><Text style={styles.brandGlyph}>V</Text></View>
            <Text style={styles.brand}>VISIONCORE</Text>
            <View style={styles.beta}><Text style={styles.betaText}>PRIVATE BETA</Text></View>
          </View>

          <View style={styles.hero}>
            <Text style={styles.eyebrow}>COLOR INTELLIGENCE</Text>
            <Text style={styles.title}>{hasResults ? "Your Head-to-Toe Breakdown" : "See your outfit clearly."}</Text>
            <Text style={styles.subtitle}>{hasResults ? "Every displayed identity follows VisionCore’s authoritative color evidence." : "Take or choose one full-outfit photo. VisionCore identifies each piece and measures its color."}</Text>
          </View>

          {image ? <Image source={{ uri: image.uri }} style={styles.preview} resizeMode="cover" /> : (
            <View style={styles.emptyPreview}>
              <Text style={styles.emptyIcon}>◇</Text>
              <Text style={styles.emptyTitle}>Full outfit photo</Text>
              <Text style={styles.emptyText}>For the best read, include your outfit from shoulders to shoes in clear lighting.</Text>
            </View>
          )}

          <View style={styles.buttonRow}>
            <Pressable style={styles.secondaryButton} onPress={() => selectImage("camera")} disabled={loading}>
              <Text style={styles.secondaryButtonText}>Take Photo</Text>
            </Pressable>
            <Pressable style={styles.secondaryButton} onPress={() => selectImage("library")} disabled={loading}>
              <Text style={styles.secondaryButtonText}>Choose Photo</Text>
            </Pressable>
          </View>

          {image ? (
            <Pressable style={[styles.analyzeButton, loading && styles.disabled]} onPress={runAnalysis} disabled={loading}>
              {loading ? <ActivityIndicator color={theme.colors.background} /> : <Text style={styles.analyzeText}>{hasResults ? "Analyze Again" : "Analyze Outfit"}</Text>}
            </Pressable>
          ) : null}

          {loading ? <View style={styles.progress}><Text style={styles.progressTitle}>{progressCopy}</Text><Text style={styles.progressText}>VisionCore is checking piece identity and owned color evidence. This may take about a minute.</Text></View> : null}

          {hasResults ? <View style={styles.results}>{zones.map((zone) => <ZoneCard key={zone.key} zone={zone} />)}</View> : null}
        </ScrollView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: theme.colors.background, flex: 1 },
  content: { gap: 24, padding: 22, paddingBottom: 56 },
  brandRow: { alignItems: "center", flexDirection: "row", gap: 10 },
  brandMark: { alignItems: "center", backgroundColor: theme.colors.cyan, borderRadius: 12, height: 38, justifyContent: "center", width: 38 },
  brandGlyph: { color: theme.colors.background, fontSize: 19, fontWeight: "900" },
  brand: { color: theme.colors.text, fontSize: 15, fontWeight: "800", letterSpacing: 2.4 },
  beta: { backgroundColor: "rgba(155,114,255,0.16)", borderRadius: 99, marginLeft: "auto", paddingHorizontal: 10, paddingVertical: 6 },
  betaText: { color: theme.colors.violet, fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  hero: { gap: 10, marginTop: 18 },
  eyebrow: { color: theme.colors.cyan, fontSize: 12, fontWeight: "800", letterSpacing: 2.5 },
  title: { color: theme.colors.text, fontSize: 38, fontWeight: "800", letterSpacing: -1.1, lineHeight: 43 },
  subtitle: { color: theme.colors.muted, fontSize: 17, lineHeight: 25 },
  preview: { aspectRatio: 0.74, backgroundColor: theme.colors.surface, borderRadius: theme.radius.large, width: "100%" },
  emptyPreview: { alignItems: "center", aspectRatio: 1.12, backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderRadius: theme.radius.large, borderStyle: "dashed", borderWidth: 1, justifyContent: "center", padding: 35 },
  emptyIcon: { color: theme.colors.cyan, fontSize: 52 },
  emptyTitle: { color: theme.colors.text, fontSize: 22, fontWeight: "700", marginTop: 12 },
  emptyText: { color: theme.colors.muted, fontSize: 15, lineHeight: 22, marginTop: 8, textAlign: "center" },
  buttonRow: { flexDirection: "row", gap: 12 },
  secondaryButton: { alignItems: "center", backgroundColor: theme.colors.surfaceRaised, borderColor: theme.colors.border, borderRadius: theme.radius.medium, borderWidth: 1, flex: 1, padding: 17 },
  secondaryButtonText: { color: theme.colors.text, fontSize: 16, fontWeight: "700" },
  analyzeButton: { alignItems: "center", backgroundColor: theme.colors.cyan, borderRadius: theme.radius.medium, minHeight: 56, justifyContent: "center", padding: 17 },
  analyzeText: { color: theme.colors.background, fontSize: 17, fontWeight: "800" },
  disabled: { opacity: 0.65 },
  progress: { backgroundColor: theme.colors.surface, borderRadius: theme.radius.medium, gap: 7, padding: 20 },
  progressTitle: { color: theme.colors.text, fontSize: 17, fontWeight: "700" },
  progressText: { color: theme.colors.muted, fontSize: 14, lineHeight: 20 },
  results: { gap: 16 }
});
