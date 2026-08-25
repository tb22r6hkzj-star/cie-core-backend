import chroma from "chroma-js";
import { applyGarmentColorConstancyToRegionsV1 } from "./garmentColorConstancyIntegrationV1.js";

const TARGET_ZONES = new Set(["upper_garment"]);
const DINO_SOURCE_TYPES = new Set(["grounding_dino", "dino_detection"]);
const CONSENSUS_DISTANCE = 11;
const MIN_VALID_WINDOWS = 4;
const MIN_CONSENSUS_RATIO = 0.6;

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function safeHex(value) {
  try {
    return chroma(value).hex().toUpperCase();
  } catch {
    return null;
  }
}

function round3(value) {
  return Math.round(Number(value || 0) * 1000) / 1000;
}

function normalizeBox(regionOrBox = {}, imageWidth = 0, imageHeight = 0) {
  const box = regionOrBox?.bounding_box || regionOrBox?.bbox || regionOrBox?.mask_geometry?.bbox || regionOrBox || null;
  if (!box) return null;

  let x = Number(box.x ?? box.left ?? box.x_min);
  let y = Number(box.y ?? box.top ?? box.y_min);
  let width = Number(box.width);
  let height = Number(box.height);
  const right = Number(box.right ?? box.x_max);
  const bottom = Number(box.bottom ?? box.y_max);

  if (!Number.isFinite(width) && Number.isFinite(x) && Number.isFinite(right)) width = right - x;
  if (!Number.isFinite(height) && Number.isFinite(y) && Number.isFinite(bottom)) height = bottom - y;
  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return null;

  const pixelBased = x > 1 || y > 1 || width > 1 || height > 1;
  if (pixelBased) {
    if (!imageWidth || !imageHeight) return null;
    x /= imageWidth;
    width /= imageWidth;
    y /= imageHeight;
    height /= imageHeight;
  }

  const left = clamp01(x);
  const top = clamp01(y);
  const r = clamp01(x + width);
  const b = clamp01(y + height);
  if (r <= left || b <= top) return null;
  return { x: left, y: top, right: r, bottom: b, width: r - left, height: b - top };
}

const WINDOW_SPECS = [
  { id: "upper_left", x: 0.28, y: 0.27, w: 0.18, h: 0.22 },
  { id: "upper_center", x: 0.41, y: 0.25, w: 0.18, h: 0.24 },
  { id: "upper_right", x: 0.54, y: 0.27, w: 0.18, h: 0.22 },
  { id: "lower_left", x: 0.29, y: 0.52, w: 0.18, h: 0.22 },
  { id: "lower_center", x: 0.41, y: 0.50, w: 0.18, h: 0.24 },
  { id: "lower_right", x: 0.53, y: 0.52, w: 0.18, h: 0.22 },
];

function sampleWindow(decodedImage, bbox, spec) {
  const width = Number(decodedImage?.width || 0);
  const height = Number(decodedImage?.height || 0);
  const data = decodedImage?.data;
  if (!width || !height || !data) return null;

  const x0 = Math.max(0, Math.floor((bbox.x + bbox.width * spec.x) * width));
  const y0 = Math.max(0, Math.floor((bbox.y + bbox.height * spec.y) * height));
  const x1 = Math.min(width, Math.ceil((bbox.x + bbox.width * (spec.x + spec.w)) * width));
  const y1 = Math.min(height, Math.ceil((bbox.y + bbox.height * (spec.y + spec.h)) * height));
  if (x1 <= x0 || y1 <= y0) return null;

  const pixels = [];
  for (let y = y0; y < y1; y += 2) {
    for (let x = x0; x < x1; x += 2) {
      const i = (y * width + x) * 4;
      const alpha = Number(data[i + 3] ?? 255);
      if (alpha < 64) continue;
      pixels.push([Number(data[i] || 0), Number(data[i + 1] || 0), Number(data[i + 2] || 0)]);
    }
  }
  if (pixels.length < 8) return null;

  const labs = pixels.map((rgb) => chroma(rgb).lab()).sort((a, b) => a[0] - b[0]);
  const trim = Math.floor(labs.length * 0.18);
  const kept = labs.slice(trim, Math.max(trim + 1, labs.length - trim));
  const medianLab = [0, 1, 2].map((idx) => {
    const values = kept.map((lab) => lab[idx]).sort((a, b) => a - b);
    return values[Math.floor(values.length / 2)];
  });
  const hex = safeHex(chroma.lab(...medianLab).hex());
  if (!hex) return null;
  return {
    id: spec.id,
    hex,
    lab: chroma(hex).lab(),
    sample_count: pixels.length,
    lightness: Number(chroma(hex).get("lab.l").toFixed(2)),
  };
}

function distance(a, b) {
  try {
    return chroma.distance(a, b, "lab");
  } catch {
    return 100;
  }
}

function buildConsensus(windows = []) {
  if (windows.length < MIN_VALID_WINDOWS) {
    return { available: false, reason: "insufficient_interior_windows", windows };
  }

  const neighborhoods = windows.map((window) => {
    const members = windows.filter((candidate) => distance(window.hex, candidate.hex) <= CONSENSUS_DISTANCE);
    const totalDistance = members.reduce((sum, member) => sum + distance(window.hex, member.hex), 0);
    return { center: window, members, totalDistance };
  }).sort((a, b) => {
    if (b.members.length !== a.members.length) return b.members.length - a.members.length;
    return a.totalDistance - b.totalDistance;
  });

  const best = neighborhoods[0];
  const ratio = best.members.length / windows.length;
  if (ratio < MIN_CONSENSUS_RATIO || best.members.length < 3) {
    return {
      available: true,
      stable: false,
      reason: "interior_tone_disagreement",
      consensus_ratio: round3(ratio),
      consensus_count: best.members.length,
      window_count: windows.length,
      windows,
    };
  }

  const medoid = best.members
    .map((candidate) => ({
      candidate,
      totalDistance: best.members.reduce((sum, member) => sum + distance(candidate.hex, member.hex), 0),
    }))
    .sort((a, b) => a.totalDistance - b.totalDistance)[0]?.candidate;

  const sortedLightness = best.members.map((member) => member.lightness).sort((a, b) => a - b);
  const medianLightness = sortedLightness[Math.floor(sortedLightness.length / 2)];
  const lightnessSpread = sortedLightness[sortedLightness.length - 1] - sortedLightness[0];

  return {
    available: true,
    stable: true,
    reason: "multi_window_interior_consensus",
    stable_hex: medoid?.hex || best.center.hex,
    consensus_ratio: round3(ratio),
    consensus_count: best.members.length,
    window_count: windows.length,
    median_lightness: Number(medianLightness.toFixed(2)),
    lightness_spread: Number(lightnessSpread.toFixed(2)),
    member_ids: best.members.map((member) => member.id),
    windows,
  };
}

function mergeStableToneIntoColors(region = {}, stableHex, supportRatio) {
  const stable = safeHex(stableHex);
  if (!stable) return Array.isArray(region?.region_colors) ? region.region_colors : [];
  const existing = Array.isArray(region?.region_colors) ? region.region_colors : [];
  const nearStable = existing.find((color) => distance(color?.hex || color?.base, stable) <= 8);
  const stableColor = {
    ...(nearStable || {}),
    hex: stable,
    pct: Math.max(Number(nearStable?.pct || 0), Number(supportRatio || 0)),
    source: "garment_tone_stability_v1",
    tone_stability_support: round3(supportRatio),
  };
  const remainder = existing.filter((color) => distance(color?.hex || color?.base, stable) > 8);
  return [stableColor, ...remainder].slice(0, 6);
}

export function analyzeGarmentToneStabilityV1({ decodedImage = null, bbox = null } = {}) {
  const normalized = normalizeBox(bbox || {}, decodedImage?.width, decodedImage?.height);
  if (!normalized || !decodedImage?.data) {
    return { available: false, reason: "missing_image_or_bbox" };
  }
  const windows = WINDOW_SPECS.map((spec) => sampleWindow(decodedImage, normalized, spec)).filter(Boolean);
  return buildConsensus(windows);
}

export function applyGarmentToneStabilityV1({ decodedImage = null, regions = [] } = {}) {
  if (!decodedImage?.data || !Array.isArray(regions) || !regions.length) {
    return {
      regions: Array.isArray(regions) ? regions : [],
      summary: { available: false, version: "garment_tone_stability_v1", reason: "missing_image_or_regions" },
    };
  }

  let correctedRegionCount = 0;
  let unresolvedRegionCount = 0;
  const out = regions.map((region) => {
    if (!TARGET_ZONES.has(String(region?.zone || ""))) return region;
    if (!DINO_SOURCE_TYPES.has(region?.source_type)) return region;

    const bbox = region?.bounding_box || region?.bbox || region?.mask_geometry?.bbox || null;
    const analysis = analyzeGarmentToneStabilityV1({ decodedImage, bbox });
    if (!analysis?.available || !analysis?.stable || !analysis?.stable_hex) {
      if (analysis?.available) unresolvedRegionCount += 1;
      return {
        ...region,
        color_debug: {
          ...(region?.color_debug || {}),
          garment_tone_stability_v1: analysis,
        },
      };
    }

    const previousHex = safeHex(region?.dominant_hex || region?.region_colors?.[0]?.hex || "");
    const stableHex = safeHex(analysis.stable_hex);
    const changed = !!stableHex && (!previousHex || distance(previousHex, stableHex) > 6);
    if (changed) correctedRegionCount += 1;

    return {
      ...region,
      dominant_hex: stableHex || region?.dominant_hex,
      region_colors: mergeStableToneIntoColors(region, stableHex, analysis.consensus_ratio),
      color_debug: {
        ...(region?.color_debug || {}),
        garment_tone_stability_v1: {
          ...analysis,
          applied: true,
          previous_dominant_hex: previousHex,
          stable_dominant_hex: stableHex,
          changed,
          authority: "multi_window_interior_tone_consensus",
        },
      },
    };
  });

  // Final garment-evidence handoff: once ownership and purity stages have run,
  // constancy separates immutable raw measurements from the publishable
  // intrinsic material palette before downstream color evidence sees them.
  const constancyRegions = out.map((region) => (
    TARGET_ZONES.has(String(region?.zone || ""))
      ? applyGarmentColorConstancyToRegionsV1([region], { mode: "assist" })[0]
      : region
  ));
  const constancyAppliedCount = constancyRegions.filter((region) => region?.color_debug?.garment_color_constancy_v1?.applied).length;

  return {
    regions: constancyRegions,
    summary: {
      available: true,
      version: "garment_tone_stability_v1",
      corrected_region_count: correctedRegionCount,
      unresolved_region_count: unresolvedRegionCount,
      color_constancy_v1: {
        mode: "assist",
        applied_region_count: constancyAppliedCount,
        handoff: "post_purity_pre_color_evidence",
      },
      policy: {
        target_zones: [...TARGET_ZONES],
        color_specific_bias: false,
        consensus_distance_delta_e: CONSENSUS_DISTANCE,
        minimum_valid_windows: MIN_VALID_WINDOWS,
        minimum_consensus_ratio: MIN_CONSENSUS_RATIO,
        estimator: "interior_window_lab_medoid",
        highlight_shadow_strategy: "trim_each_window_then_require_cross_window_consensus",
        downstream_color_lane: "constancy_reconciled_publishable_palette",
      },
    },
  };
}
