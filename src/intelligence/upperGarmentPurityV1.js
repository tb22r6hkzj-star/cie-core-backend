import chroma from "chroma-js";

const UPPER_ZONE = "upper_garment";
const DINO_SOURCE_TYPES = new Set(["grounding_dino", "dino_detection"]);

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

function normalizeBox(region = {}, imageWidth = 0, imageHeight = 0) {
  const box = region?.bounding_box || region?.bbox || region?.mask_geometry?.bbox || null;
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

function regionClass(rx, ry) {
  if (ry < 0.18) return "neckline_top";
  if (ry > 0.84) return "waist_bottom";
  if (rx < 0.11 || rx > 0.89) return "outer_edge";
  if ((rx < 0.25 || rx > 0.75) && ry > 0.28 && ry < 0.76) return "underarm_side";
  return "body";
}

function sampleWeight(regionClassName, rgb) {
  const lightness = chroma(rgb).get("lab.l");
  const isDeep = lightness < 24;

  switch (regionClassName) {
    case "body": return 1;
    case "neckline_top": return 0.32;
    case "waist_bottom": return 0.36;
    case "outer_edge": return 0.28;
    case "underarm_side": return isDeep ? 0.12 : 0.34;
    default: return 0.25;
  }
}

function bucketKey(r, g, b) {
  return `${Math.round(r / 18)}_${Math.round(g / 18)}_${Math.round(b / 18)}`;
}

function sampleUpperRegion(decodedImage, bbox) {
  const width = Number(decodedImage?.width || 0);
  const height = Number(decodedImage?.height || 0);
  const data = decodedImage?.data;
  if (!width || !height || !data || !bbox) return null;

  const x0 = Math.max(0, Math.floor(bbox.x * width));
  const y0 = Math.max(0, Math.floor(bbox.y * height));
  const x1 = Math.min(width, Math.ceil(bbox.right * width));
  const y1 = Math.min(height, Math.ceil(bbox.bottom * height));
  if (x1 <= x0 || y1 <= y0) return null;

  const pixelArea = (x1 - x0) * (y1 - y0);
  const stride = Math.max(1, Math.floor(Math.sqrt(pixelArea / 18000)));
  const buckets = new Map();
  const classStats = new Map();
  let sampleCount = 0;
  let weightedMass = 0;

  for (let py = y0; py < y1; py += stride) {
    for (let px = x0; px < x1; px += stride) {
      const idx = (py * width + px) * 4;
      const alpha = Number(data[idx + 3] ?? 255);
      if (alpha < 32) continue;
      const r = Number(data[idx] || 0);
      const g = Number(data[idx + 1] || 0);
      const b = Number(data[idx + 2] || 0);
      const rx = (px / width - bbox.x) / bbox.width;
      const ry = (py / height - bbox.y) / bbox.height;
      const cls = regionClass(rx, ry);
      const weight = sampleWeight(cls, [r, g, b]);
      const key = bucketKey(r, g, b);
      if (!buckets.has(key)) buckets.set(key, { weighted: 0, count: 0, r: 0, g: 0, b: 0, classMass: new Map() });
      const bucket = buckets.get(key);
      bucket.weighted += weight;
      bucket.count += 1;
      bucket.r += r;
      bucket.g += g;
      bucket.b += b;
      bucket.classMass.set(cls, (bucket.classMass.get(cls) || 0) + weight);
      classStats.set(cls, (classStats.get(cls) || 0) + weight);
      weightedMass += weight;
      sampleCount += 1;
    }
  }

  return { buckets, classStats, weightedMass, sampleCount };
}

function mergeClusters(sampled) {
  if (!sampled?.weightedMass) return [];
  const candidates = [...sampled.buckets.values()]
    .map((bucket) => {
      const rgb = [
        Math.round(bucket.r / bucket.count),
        Math.round(bucket.g / bucket.count),
        Math.round(bucket.b / bucket.count),
      ];
      const hex = safeHex(chroma(rgb).hex());
      const bodyMass = Number(bucket.classMass.get("body") || 0);
      const boundaryMass = Number(bucket.classMass.get("neckline_top") || 0)
        + Number(bucket.classMass.get("waist_bottom") || 0)
        + Number(bucket.classMass.get("outer_edge") || 0);
      const underarmMass = Number(bucket.classMass.get("underarm_side") || 0);
      return { hex, rgb, weighted: bucket.weighted, bodyMass, boundaryMass, underarmMass };
    })
    .filter((candidate) => candidate.hex)
    .sort((a, b) => b.weighted - a.weighted);

  const clusters = [];
  for (const candidate of candidates) {
    const match = clusters.find((cluster) => chroma.distance(cluster.hex, candidate.hex, "lab") < 10);
    if (match) {
      const total = match.weighted + candidate.weighted;
      match.rgb = [0, 1, 2].map((i) => Math.round((match.rgb[i] * match.weighted + candidate.rgb[i] * candidate.weighted) / total));
      match.hex = safeHex(chroma(match.rgb).hex());
      match.weighted = total;
      match.bodyMass += candidate.bodyMass;
      match.boundaryMass += candidate.boundaryMass;
      match.underarmMass += candidate.underarmMass;
    } else {
      clusters.push({ ...candidate });
    }
  }

  const totalWeighted = clusters.reduce((sum, cluster) => sum + cluster.weighted, 0) || 1;
  return clusters
    .map((cluster) => {
      const bodyShare = cluster.weighted ? cluster.bodyMass / cluster.weighted : 0;
      const boundaryShare = cluster.weighted ? cluster.boundaryMass / cluster.weighted : 0;
      const underarmShare = cluster.weighted ? cluster.underarmMass / cluster.weighted : 0;
      const lightness = chroma(cluster.hex).get("lab.l");
      const deepContextPenalty = lightness < 24 && bodyShare < 0.42 && (underarmShare > 0.18 || boundaryShare > 0.46) ? 0.42 : 1;
      const effective = cluster.weighted * deepContextPenalty;
      return { ...cluster, bodyShare, boundaryShare, underarmShare, deepContextPenalty, effective };
    })
    .sort((a, b) => b.effective - a.effective)
    .slice(0, 6)
    .map((cluster) => ({
      hex: cluster.hex,
      pct: round3(cluster.effective / totalWeighted),
      raw_weighted_pct: round3(cluster.weighted / totalWeighted),
      body_share: round3(cluster.bodyShare),
      boundary_share: round3(cluster.boundaryShare),
      underarm_share: round3(cluster.underarmShare),
      spatial_penalty: round3(cluster.deepContextPenalty),
      source: "upper_garment_purity_v1",
    }));
}

export function applyUpperGarmentPurityV1({ decodedImage = null, regions = [] } = {}) {
  if (!decodedImage?.data || !Array.isArray(regions) || !regions.length) {
    return {
      regions: Array.isArray(regions) ? regions : [],
      summary: { available: false, version: "upper_garment_purity_v1", reason: "missing_image_or_regions" },
    };
  }

  const width = Number(decodedImage.width || 0);
  const height = Number(decodedImage.height || 0);
  let correctedRegionCount = 0;

  const out = regions.map((region) => {
    if (String(region?.zone || "") !== UPPER_ZONE) return region;
    if (!DINO_SOURCE_TYPES.has(region?.source_type)) return region;
    const bbox = normalizeBox(region, width, height);
    if (!bbox) return region;

    const sampled = sampleUpperRegion(decodedImage, bbox);
    const purifiedColors = mergeClusters(sampled);
    if (!purifiedColors.length) return region;

    correctedRegionCount += 1;
    const rawDominantHex = safeHex(region?.dominant_hex || region?.region_colors?.[0]?.hex || "");
    return {
      ...region,
      dominant_hex: purifiedColors[0].hex,
      region_colors: purifiedColors,
      color_debug: {
        ...(region?.color_debug || {}),
        upper_garment_purity_v1: {
          applied: true,
          authority: "spatially_weighted_upper_garment_body_evidence",
          raw_dominant_hex: rawDominantHex,
          raw_region_colors: Array.isArray(region?.region_colors) ? region.region_colors : [],
          purified_dominant_hex: purifiedColors[0].hex,
          purified_region_colors: purifiedColors,
          sample_count: sampled?.sampleCount || 0,
          body_weight: round3(sampled?.classStats?.get("body") || 0),
          neckline_top_weight: round3(sampled?.classStats?.get("neckline_top") || 0),
          waist_bottom_weight: round3(sampled?.classStats?.get("waist_bottom") || 0),
          outer_edge_weight: round3(sampled?.classStats?.get("outer_edge") || 0),
          underarm_side_weight: round3(sampled?.classStats?.get("underarm_side") || 0),
        },
      },
    };
  });

  return {
    regions: out,
    summary: {
      available: true,
      version: "upper_garment_purity_v1",
      corrected_region_count: correctedRegionCount,
      policy: {
        color_specific_bias: false,
        body_weight: 1,
        neckline_top_weight: 0.32,
        waist_bottom_weight: 0.36,
        outer_edge_weight: 0.28,
        deep_underarm_weight: 0.12,
        deep_context_cluster_penalty: 0.42,
      },
    },
  };
}
