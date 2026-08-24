import chroma from "chroma-js";

function clamp01(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
}

function safeHex(value) {
  try {
    const raw = typeof value === "string" ? value : value?.hex;
    return raw ? chroma(raw).hex().toUpperCase() : null;
  } catch {
    return null;
  }
}

function linearChannel(value) {
  const c = clamp01(value / 255);
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function describe(hex) {
  const rgb = chroma(hex).rgb();
  const linear = rgb.map(linearChannel);
  const sum = linear.reduce((a, b) => a + b, 0) || 1;
  const [l, a, b] = chroma(hex).lab();
  return {
    rgb,
    chromaticity: linear.map((v) => v / sum),
    lab: { l, a, b },
  };
}

function sourceAuthority(sample = {}) {
  const source = String(sample?.source || sample?.measurement_source || "").toLowerCase();
  if (source === "garment_tone_stability_v1") return 1.6;
  if (source === "dino_bbox_interior" || source === "owned_interior_pixels" || source === "sam_mask_interior") return 1.15;
  return 1;
}

function sampleWeight(sample = {}) {
  const pct = Number(sample?.pct ?? sample?.percentage);
  const pixels = Number(sample?.pixel_count ?? sample?.sample_count);
  const confidence = Number(sample?.confidence);
  const abundance = Number.isFinite(pct) && pct > 0 ? pct : Number.isFinite(pixels) && pixels > 0 ? Math.log1p(pixels) : 1;
  const conf = Number.isFinite(confidence) ? clamp01(confidence > 1 ? confidence / 100 : confidence) : 1;
  return Math.max(0.001, abundance * Math.max(0.25, conf) * sourceAuthority(sample));
}

function owned(sample = {}) {
  const state = String(sample?.ownership_state || sample?.ownership || "owned").toLowerCase();
  return !["scene", "background", "unknown", "rejected", "unowned"].includes(state);
}

function weightedMean(rows, getter) {
  const total = rows.reduce((sum, row) => sum + row.weight, 0) || 1;
  return rows.reduce((sum, row) => sum + getter(row) * row.weight, 0) / total;
}

function distance(a, b) {
  const chromaDistance = Math.sqrt(a.features.chromaticity.reduce((sum, value, i) => sum + (value - b.features.chromaticity[i]) ** 2, 0));
  const da = (a.features.lab.a - b.features.lab.a) / 128;
  const db = (a.features.lab.b - b.features.lab.b) / 128;
  const chromaticLabDistance = Math.sqrt(da * da + db * db);
  const dl = Math.abs(a.features.lab.l - b.features.lab.l) / 100;
  return chromaDistance * 0.58 + chromaticLabDistance * 0.32 + dl * 0.10;
}

function weightedMedoid(rows) {
  return rows
    .map((candidate) => ({ candidate, cost: rows.reduce((sum, row) => sum + distance(candidate, row) * row.weight, 0) }))
    .sort((a, b) => a.cost - b.cost)[0]?.candidate || null;
}

/**
 * Garment Color Constancy / Intrinsic Color V1
 *
 * Raw measured hex values remain immutable evidence. This layer selects the
 * measured sample that best represents stable material identity after strongly
 * discounting brightness and comparing linear-RGB chromaticity plus LAB
 * chromatic direction. It never invents a replacement hex.
 */
export function estimateGarmentIntrinsicColorV1(samples = []) {
  const rows = (Array.isArray(samples) ? samples : [])
    .filter(owned)
    .map((sample, index) => {
      const hex = safeHex(sample);
      return hex ? { index, sample, hex, weight: sampleWeight(sample), features: describe(hex) } : null;
    })
    .filter(Boolean);

  if (!rows.length) return { available: false, version: "garment_color_constancy_v1", reason: "no_owned_measured_colors" };

  const medoid = weightedMedoid(rows);
  const distances = rows.map((row) => ({ ...row, intrinsic_distance: distance(medoid, row) }));
  const avgDistance = weightedMean(distances, (row) => row.intrinsic_distance);
  const threshold = Math.max(0.045, Math.min(0.09, avgDistance * 1.8));
  const family = distances.filter((row) => row.intrinsic_distance <= threshold);
  const totalWeight = rows.reduce((sum, row) => sum + row.weight, 0);
  const familyWeight = family.reduce((sum, row) => sum + row.weight, 0);
  const supportRatio = totalWeight ? familyWeight / totalWeight : 0;
  const chromaticitySpread = weightedMean(family.length ? family : rows, (row) => {
    const a = row.features.chromaticity;
    const b = medoid.features.chromaticity;
    return Math.sqrt(a.reduce((sum, value, i) => sum + (value - b[i]) ** 2, 0));
  });
  const lightness = rows.map((row) => row.features.lab.l);
  const lightnessSpread = Math.max(...lightness) - Math.min(...lightness);

  return {
    available: true,
    version: "garment_color_constancy_v1",
    intrinsic_hex: medoid.hex,
    intrinsic_source_index: medoid.index,
    intrinsic_sample: medoid.sample,
    support_ratio: supportRatio,
    stable_material_identity: supportRatio >= 0.6 && chromaticitySpread <= 0.08,
    chromaticity_spread: chromaticitySpread,
    lightness_spread: lightnessSpread,
    illumination_variation_detected: lightnessSpread >= 8,
    samples: distances.map((row) => ({
      hex: row.hex,
      weight: row.weight,
      intrinsic_distance: row.intrinsic_distance,
      chromaticity: row.features.chromaticity,
      lab: row.features.lab,
      same_material_family: row.intrinsic_distance <= threshold,
    })),
    policy: {
      raw_hexes_are_immutable_evidence: true,
      single_hex_cannot_define_material_identity: true,
      luminance_variation_is_discounted: true,
      chromatic_direction_outweighs_brightness: true,
      intrinsic_hex_must_be_measured_not_invented: true,
      minimum_same_material_distance: 0.045,
      multi_window_consensus_receives_higher_measurement_authority: true,
    },
  };
}
