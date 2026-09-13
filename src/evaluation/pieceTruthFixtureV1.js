import chroma from "chroma-js";

function token(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function safeHex(value) {
  try { return chroma(value).hex().toUpperCase(); } catch { return null; }
}

function asRows(value) {
  return Array.isArray(value) ? value.filter((row) => row && typeof row === "object") : [];
}

function unwrapAnalysis(payload = {}) {
  return payload?.outfit_analysis || payload?.outfitAnalysis || payload;
}

function typeOf(row = {}, fallback = "") {
  return token(
    row?.piece_type || row?.accessory_type || row?.garment_type || row?.object_type ||
    row?.semantic_subtype || row?.subtype || row?.label || row?.display_zone_label || row?.type || fallback
  );
}

function paletteOf(row = {}) {
  const candidates = [
    row?.primary_color,
    row?.dominant_color,
    ...(asRows(row?.object_local_colors)),
    ...(asRows(row?.region_colors)),
    ...(asRows(row?.detected_colors)),
    ...(asRows(row?.secondary_colors)),
    ...(asRows(row?.support_colors)),
    ...(asRows(row?.accent_colors)),
    row?.hex ? { hex: row.hex, name: row?.name } : null,
  ].filter(Boolean);
  const seen = new Set();
  return candidates.filter((color) => {
    const hex = safeHex(color?.hex);
    if (!hex || seen.has(hex)) return false;
    seen.add(hex);
    return true;
  }).map((color) => ({ ...color, hex: safeHex(color.hex) }));
}

function normalizedMode(row = {}) {
  const value = token(row?.color_mode || row?.interpretation || row?.read_mode);
  if (["multi_color", "multicolor", "patterned"].includes(value)) return "multicolor";
  if (["single", "single_color", "solid"].includes(value)) return "single_color";
  return value || null;
}

function colorTraits(hex) {
  const safe = safeHex(hex);
  if (!safe) return null;
  const [l, a, b] = chroma(safe).lab();
  const [h, s, light] = chroma(safe).hsl();
  return {
    hex: safe,
    lab_lightness: l,
    chroma: Math.sqrt(a * a + b * b),
    hue: Number.isFinite(h) ? h : null,
    saturation: s,
    lightness: light,
  };
}

function matchesFamily(color, family) {
  const traits = colorTraits(color?.hex);
  if (!traits) return false;
  const name = token(color?.name || color?.display_name || color?.color_identity?.family);
  if (family === "white") return traits.lab_lightness >= 78 && traits.chroma <= 18;
  if (family === "warm_dark_brown") {
    return traits.lab_lightness <= 32 && (
      /brown|espresso|chocolate|umber|warm/.test(name) ||
      (traits.chroma >= 3.5 && traits.hue !== null && (traits.hue <= 65 || traits.hue >= 345))
    );
  }
  if (family === "taupe_brown") {
    return traits.lab_lightness >= 22 && traits.lab_lightness <= 68 && (
      /brown|taupe|tan|umber|stone/.test(name) ||
      (traits.chroma >= 3 && traits.hue !== null && traits.hue <= 75)
    );
  }
  if (family === "silver_tone") {
    return /silver|diamond|platinum|chrome|white_metal/.test(name) ||
      (traits.lab_lightness >= 38 && traits.chroma <= 13);
  }
  return name.includes(token(family));
}

function aliasesFor(expected = {}) {
  return new Set([expected.id, ...(expected.aliases || [])].map(token).filter(Boolean));
}

function collectProjections(payload = {}) {
  const analysis = unwrapAnalysis(payload);
  const collections = [];
  const zones = analysis?.garment_zones?.zones || analysis?.zones || {};
  collections.push({ name: "garment_zones.zones", rows: Object.entries(zones).map(([key, row]) => ({ ...row, _zone_key: key })) });
  collections.push({ name: "accessory_instances_v1.instances", rows: asRows(analysis?.accessory_instances_v1?.instances) });
  collections.push({ name: "garment_zones.accessory_instances", rows: asRows(analysis?.garment_zones?.accessory_instances) });
  collections.push({ name: "accessory_analysis", rows: asRows(analysis?.accessory_analysis) });
  collections.push({ name: "garment_analysis.detected_items", rows: asRows(analysis?.garment_analysis?.detected_items) });
  collections.push({ name: "material_analysis.detected_items", rows: asRows(analysis?.material_analysis?.detected_items) });
  return collections;
}

function findMatches(collection, expected) {
  const aliases = aliasesFor(expected);
  return collection.rows.filter((row) => {
    const values = [
      typeOf(row, row?._zone_key), row?._zone_key, row?.zone_key, row?.semantic_instance_key,
      row?.instance_key, row?.piece, row?.name, row?.display_name,
    ].map(token);
    return values.some((value) => aliases.has(value) || [...aliases].some((alias) =>
      `_${value}_`.includes(`_${alias}_`)
    ));
  });
}

function publishedColor(row = {}) {
  const decision = token(row?.color_publication_decision || row?.validation_decision || row?.publication_state);
  return paletteOf(row).length > 0 && !/withhold|identity_only|reject|unknown/.test(decision);
}

function stableProjection(row = {}) {
  const primary = paletteOf(row)[0] || null;
  return {
    mode: normalizedMode(row),
    primary_hex: primary?.hex || null,
    primary_name: token(primary?.name || row?.name),
    color_published: publishedColor(row),
  };
}

function unresolvedRemeasurement(row = {}) {
  const requested = row?.remeasurement_requested === true ||
    row?.targeted_remeasurement_requested === true ||
    row?.visioncore_remeasurement_required === true ||
    row?.correction_required === true;
  const completed = row?.remeasurement_completed === true ||
    row?.visioncore_remeasurement?.ok === true ||
    row?.correction_state === "completed";
  return requested && !completed;
}

function finding(code, piece, message, evidence = {}) {
  return { code, piece, message, evidence };
}

export function evaluatePieceTruthFixtureV1(fixture = {}, payload = {}) {
  const collections = collectProjections(payload);
  const canonical = collections[0];
  const findings = [];

  for (const expected of asRows(fixture?.expected_pieces)) {
    const piece = token(expected.id);
    const canonicalMatches = findMatches(canonical, expected);
    const allMatches = collections.flatMap((collection) =>
      findMatches(collection, expected).map((row) => ({ collection: collection.name, row }))
    );
    const uniqueInstances = new Set(allMatches.map(({ row }) => token(
      row?.semantic_instance_key || row?.instance_key || row?.zone_key || row?._zone_key || typeOf(row)
    )).filter(Boolean));

    if (canonicalMatches.length < Number(expected?.min_count ?? 1)) {
      findings.push(finding("missing_piece", piece, `${piece} is missing from the canonical publication`, { count: canonicalMatches.length }));
      continue;
    }
    if (Number.isFinite(Number(expected?.max_count)) && uniqueInstances.size > Number(expected.max_count)) {
      findings.push(finding("duplicate_piece", piece, `${piece} has duplicate published instances`, { instances: [...uniqueInstances] }));
    }

    const row = canonicalMatches[0];
    const palette = paletteOf(row);
    if (expected?.color_mode && normalizedMode(row) !== normalizedMode({ color_mode: expected.color_mode })) {
      findings.push(finding("wrong_color_mode", piece, `${piece} must publish as ${expected.color_mode}`, { actual: normalizedMode(row) }));
    }
    if (expected?.pattern_required === true) {
      const pattern = token(row?.pattern || row?.pattern_type || row?.semantic_pattern);
      if (!pattern || ["unknown", "solid", "single_color"].includes(pattern)) {
        findings.push(finding("missing_pattern_evidence", piece, `${piece} lacks finalized spatial pattern evidence`, { actual: pattern || null }));
      }
    }
    for (const family of expected?.required_color_families || []) {
      if (!palette.some((color) => matchesFamily(color, family))) {
        findings.push(finding("missing_color_family", piece, `${piece} is missing measured ${family} evidence`, { palette }));
      }
    }
    for (const forbidden of expected?.forbidden_primary_names || []) {
      const primaryName = token(palette[0]?.name || row?.name);
      if (primaryName.includes(token(forbidden))) {
        findings.push(finding("forbidden_primary_name", piece, `${piece} published a prohibited primary name`, { actual: primaryName }));
      }
    }
    if (expected?.color_publication_required === true && !publishedColor(row)) {
      findings.push(finding("color_withheld", piece, `${piece} requires a measured published color`, { decision: row?.color_publication_decision || row?.validation_decision || null }));
    }
    if (expected?.remeasurement_must_complete === true && allMatches.some(({ row: candidate }) => unresolvedRemeasurement(candidate))) {
      findings.push(finding("remeasurement_incomplete", piece, `${piece} has unresolved mandatory remeasurement`));
    }

    const projections = allMatches.map(({ collection, row: candidate }) => ({ collection, ...stableProjection(candidate) }));
    const colored = projections.filter((projection) => projection.primary_hex);
    const signatures = new Set(colored.map((projection) => JSON.stringify({
      mode: projection.mode,
      primary_hex: projection.primary_hex,
      color_published: projection.color_published,
    })));
    if (signatures.size > 1) {
      findings.push(finding("projection_drift", piece, `${piece} disagrees across customer-facing projections`, { projections }));
    }
  }

  return {
    version: "piece_truth_fixture_v1",
    fixture_id: fixture?.fixture_id || null,
    passed: findings.length === 0,
    finding_count: findings.length,
    findings,
    checked_collections: collections.map((collection) => collection.name),
  };
}
