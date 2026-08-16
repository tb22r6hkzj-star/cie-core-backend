from pathlib import Path

p = Path('src/server.js')
s = p.read_text()
old = '''  } else if (perceptionV6Mode === "assist") {
    publishedZones = Object.fromEntries(Object.entries(legacyGarmentZones.zones || {}).filter(([zone]) =>
      !(suppressibleZones.has(zone) && rejectedZones.has(zone) && !acceptedZones.has(zone))
    ));
  } else {
'''
new = '''  } else if (perceptionV6Mode === "assist") {
    const acceptedPublicationByZone = new Map();
    for (const decision of perceptionV6.zone_reconciliation || []) {
      acceptedPublicationByZone.set(decision.zone, decision);
    }
    const acceptedLabelsByZone = new Map();
    for (const decision of perceptionV6.publication_decisions || []) {
      if (!decision?.published) continue;
      const labels = acceptedLabelsByZone.get(decision.zone) || new Set();
      labels.add(String(decision.label || "").trim().toLowerCase());
      acceptedLabelsByZone.set(decision.zone, labels);
    }
    publishedZones = Object.fromEntries(Object.entries(legacyGarmentZones.zones || {}).flatMap(([zone, legacy]) => {
      if (suppressibleZones.has(zone) && rejectedZones.has(zone) && !acceptedZones.has(zone)) return [];
      if (zone !== "accessory_jewelry") return [[zone, legacy]];

      const legacyObjectType = String(legacy?.object_type || legacy?.accessory_type || "").trim().toLowerCase();
      const acceptedLabels = acceptedLabelsByZone.get(zone) || new Set();
      const legacyIdentityAccepted = legacyObjectType ? acceptedLabels.has(legacyObjectType) : true;
      if (legacyIdentityAccepted) return [[zone, legacy]];

      const reconciliation = acceptedPublicationByZone.get(zone) || null;
      if (!reconciliation?.selected_label) return [];
      const displayMetadata = inferAccessoryDisplayMetadata([reconciliation.selected_label]);
      const dominantObjectColor = reconciliation.object_local_colors?.[0] || null;
      return [[zone, {
        ...legacy,
        ...displayMetadata,
        name: reconciliation.selected_label,
        label: reconciliation.selected_label,
        hex: dominantObjectColor?.hex || legacy?.hex || null,
        object_local_colors: reconciliation.object_local_colors || [],
        evidence_ids: reconciliation.selected_evidence_ids || [],
        validation_decision: "accepted",
        publication_decision: "publish",
        reconciliation_result: "v6_object_identity_reconciled",
        legacy_diagnostic: legacy,
        perception_source: "v6_assist_identity_reconciliation",
      }]];
    }));
  } else {
'''
if old not in s:
    raise SystemExit('target assist publication block not found')
s = s.replace(old, new, 1)
p.write_text(s)
