import chroma from "chroma-js";
import { evaluateColorPublicationV3 } from "./publicationPolicyV3.js";

function clamp01(v) { return Math.max(0, Math.min(1, Number(v) || 0)); }
function safeHex(hex) { try { return chroma(hex).hex().toUpperCase(); } catch { return null; } }
function deltaE(a, b) { try { return chroma.distance(a, b, "lab"); } catch { return 100; } }
function family(hex) {
  const safe = safeHex(hex);
  if (!safe) return "unknown";
  const [hRaw, sRaw, lRaw] = chroma(safe).hsl();
  const [r, g, b] = chroma(safe).rgb();
  const h = Number.isFinite(hRaw) ? hRaw : 0;
  const s = Number(sRaw || 0);
  const l = Number(lRaw || 0);
  if (s < 0.12) {
    if (l < 0.18) return "black";
    if (l > 0.82) return "white";
    if (g - r >= 7 && g - b >= 7) return "green";
    if (b - r >= 7 && b - g >= 7) return "blue";
    if (r - b >= 8 && g - b >= 5 && r >= g) return "brown";
    return "gray";
  }
  if (h < 15 || h >= 345) return "red";
  if (h < 45) return l < 0.45 ? "brown" : "orange";
  if (h < 75) return "yellow";
  if (h < 165) return "green";
  if (h < 210) return "cyan";
  if (h < 255) return "blue";
  if (h < 315) return "purple";
  return "pink";
}

function normalizeBox(box = {}) {
  const x = Number(box.x ?? box.left ?? 0);
  const y = Number(box.y ?? box.top ?? 0);
  const width = Number(box.width ?? ((box.right ?? 0) - x));
  const height = Number(box.height ?? ((box.bottom ?? 0) - y));
  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return null;
  return { x: clamp01(x), y: clamp01(y), width: clamp01(width), height: clamp01(height) };
}

function sampleWindow(decodedImage, bbox, spec) {
  const { width: imageWidth, height: imageHeight, data } = decodedImage || {};
  if (!imageWidth || !imageHeight || !data) return null;
  const x0 = Math.max(0, Math.floor((bbox.x + bbox.width * spec.x) * imageWidth));
  const y0 = Math.max(0, Math.floor((bbox.y + bbox.height * spec.y) * imageHeight));
  const x1 = Math.min(imageWidth, Math.ceil((bbox.x + bbox.width * (spec.x + spec.w)) * imageWidth));
  const y1 = Math.min(imageHeight, Math.ceil((bbox.y + bbox.height * (spec.y + spec.h)) * imageHeight));
  const pixels = [];
  for (let y = y0; y < y1; y += 2) {
    for (let x = x0; x < x1; x += 2) {
      const i = (y * imageWidth + x) * 4;
      const a = data[i + 3] ?? 255;
      if (a < 64) continue;
      pixels.push([data[i], data[i + 1], data[i + 2]]);
    }
  }
  if (!pixels.length) return null;
  pixels.sort((a, b) => (a[0] + a[1] + a[2]) - (b[0] + b[1] + b[2]));
  const trim = Math.floor(pixels.length * 0.15);
  const kept = pixels.slice(trim, Math.max(trim + 1, pixels.length - trim));
  const rgb = [0, 1, 2].map((idx) => Math.round(kept.reduce((sum, p) => sum + p[idx], 0) / kept.length));
  const hex = chroma(rgb).hex().toUpperCase();
  return { hex, family: family(hex), sample_count: pixels.length };
}

const WINDOW_SPECS = [
  { id: "center", x: 0.30, y: 0.30, w: 0.40, h: 0.40 },
  { id: "upper", x: 0.30, y: 0.12, w: 0.40, h: 0.28 },
  { id: "lower", x: 0.30, y: 0.60, w: 0.40, h: 0.28 },
  { id: "left", x: 0.12, y: 0.30, w: 0.28, h: 0.40 },
  { id: "right", x: 0.60, y: 0.30, w: 0.28, h: 0.40 },
];

export function analyzeRegionColorEvidence({ decodedImage, bbox, expectedHex = null } = {}) {
  const normalized = normalizeBox(bbox);
  if (!normalized || !decodedImage?.data) return { available: false, reason: "missing_image_or_bbox" };
  const windows = WINDOW_SPECS.map((spec) => {
    const sampled = sampleWindow(decodedImage, normalized, spec);
    return sampled ? { id: spec.id, ...sampled } : null;
  }).filter(Boolean);
  if (!windows.length) return { available: false, reason: "no_sampled_pixels" };

  const counts = new Map();
  for (const w of windows) counts.set(w.family, (counts.get(w.family) || 0) + 1);
  const [consensusFamily, consensusCount] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  const consensusWindows = windows.filter((w) => w.family === consensusFamily);
  const consensusHex = consensusWindows[0]?.hex || windows[0].hex;
  const familyConsensus = consensusCount / windows.length;
  const pairDistances = [];
  for (let i = 0; i < windows.length; i++) for (let j = i + 1; j < windows.length; j++) pairDistances.push(deltaE(windows[i].hex, windows[j].hex));
  const meanDeltaE = pairDistances.length ? pairDistances.reduce((a, b) => a + b, 0) / pairDistances.length : 0;
  const spreadScore = clamp01(1 - meanDeltaE / 45);
  const expectedAgreement = expectedHex ? clamp01(1 - deltaE(expectedHex, consensusHex) / 45) : null;
  const purityScore = clamp01(familyConsensus * 0.70 + spreadScore * 0.30);

  return {
    available: true,
    version: "color_evidence_v1",
    window_count: windows.length,
    windows,
    consensus_family: consensusFamily,
    consensus_hex: consensusHex,
    family_consensus: Number(familyConsensus.toFixed(3)),
    mean_delta_e: Number(meanDeltaE.toFixed(2)),
    spread_score: Number(spreadScore.toFixed(3)),
    region_purity: Number(purityScore.toFixed(3)),
    expected_agreement: expectedAgreement === null ? null : Number(expectedAgreement.toFixed(3)),
    decision_state: purityScore >= 0.80 && familyConsensus >= 0.8 ? "supported" : purityScore >= 0.58 ? "observed" : "conflicted",
  };
}

function buildV3RegionClusters(region = {}, zone = {}) {
  const rawRegionColors = Array.isArray(region?.region_colors) ? region.region_colors : [];
  const zoneColors = [
    zone?.dominant_color,
    ...(Array.isArray(zone?.support_colors) ? zone.support_colors : []),
  ].filter(Boolean);
  const source = rawRegionColors.length ? rawRegionColors : zoneColors;
  return source
    .map((color) => ({
      base: safeHex(color?.hex || color?.base || ""),
      pct: Number(color?.pct ?? color?.percentage ?? 0),
    }))
    .filter((color) => color.base)
    .sort((a, b) => Number(b.pct || 0) - Number(a.pct || 0));
}

function getCurrentZoneResolution(zone = {}) {
  const hex = safeHex(zone?.primary_color?.hex || zone?.dominant_color?.hex || zone?.hex || "");
  return {
    hex,
    source: zone?.color_publication_v3?.source || zone?.publication_reason?.source || "finalized_zone_primary",
  };
}

function applyV3PublishedColor(zone, publication) {
  if (!zone || publication?.action !== "publish_v3" || !publication?.hex) return false;
  const hex = safeHex(publication.hex);
  if (!hex) return false;

  zone.hex = hex;
  if (zone.dominant_color) zone.dominant_color = { ...zone.dominant_color, hex };
  else zone.dominant_color = { hex };
  if (zone.primary_color) zone.primary_color = { ...zone.primary_color, hex };
  else zone.primary_color = { hex };
  zone.color_publication_v3 = {
    action: publication.action,
    reason: publication.reason,
    source: publication.source,
    hex,
    fusion: publication.fusion,
  };
  return true;
}

export function attachColorEvidenceToZones({ zones = {}, regions = [], decodedImage = null } = {}) {
  const out = { ...zones };
  for (const zoneKey of ["upper_garment", "lower_garment", "body_garment", "outerwear"]) {
    const zone = out[zoneKey];
    if (!zone) continue;
    const candidates = regions.filter((r) => r?.zone === zoneKey);
    const region = candidates.sort((a, b) => Number(b?.confidence || 0) - Number(a?.confidence || 0))[0];
    const bbox = region?.bounding_box || region?.bbox || region?.mask_geometry?.bbox;
    const evidence = analyzeRegionColorEvidence({ decodedImage, bbox, expectedHex: zone?.hex || zone?.dominant_color?.hex });
    const clusters = buildV3RegionClusters(region, zone);
    const publication = evaluateColorPublicationV3({
      zoneData: zone,
      clusters,
      colorEvidence: evidence,
      currentResolution: getCurrentZoneResolution(zone),
    });

    const published = applyV3PublishedColor(zone, publication);
    const evidenceWithV3 = {
      ...evidence,
      color_evidence_v3: publication.fusion,
      color_publication_v3: {
        action: publication.action,
        reason: publication.reason,
        source: publication.source,
        hex: publication.hex,
        applied_to_zone: published,
      },
    };

    out[zoneKey] = {
      ...zone,
      color_evidence_v1: evidenceWithV3,
      color_evidence_v3: publication.fusion,
      color_publication_v3: {
        action: publication.action,
        reason: publication.reason,
        source: publication.source,
        hex: publication.hex,
        applied_to_zone: published,
      },
    };
  }
  return out;
}
