from pathlib import Path

path = Path('src/server.js')
text = path.read_text()

anchor = '''const MARKET_PERCEPTION_V6_MODE = normalizePerceptionV6Mode(
  process.env.PERCEPTION_V6_MODE,
  "assist"
);
'''
replacement = anchor + '''
// Market safety: headwear perception remains available internally, but customer-facing
// assist publication stays off until hair-vs-headwear discrimination is validated.
const MARKET_HEADWEAR_PUBLICATION_ENABLED = /^(1|true|yes|on)$/i.test(
  String(process.env.HEADWEAR_MARKET_PUBLICATION_ENABLED || "")
);

function isHeadwearIdentity(value) {
  return /^(hat|cap|beanie|headwear)$/i.test(String(value || "").trim());
}
'''
if anchor not in text:
    raise SystemExit('market mode anchor missing')
text = text.replace(anchor, replacement, 1)

old = '''      const legacyObjectType = String(legacy?.object_type || legacy?.accessory_type || "").trim().toLowerCase();
      const acceptedLabels = acceptedLabelsByZone.get(zone) || new Set();
      const legacyIdentityAccepted = legacyObjectType ? acceptedLabels.has(legacyObjectType) : true;
      if (legacyIdentityAccepted) return [[zone, legacy]];

      const reconciliation = acceptedPublicationByZone.get(zone) || null;
      if (!reconciliation?.selected_label) return [];
      const displayMetadata = inferAccessoryDisplayMetadata([reconciliation.selected_label]);
'''
new = '''      const legacyObjectType = String(legacy?.object_type || legacy?.accessory_type || "").trim().toLowerCase();
      const acceptedLabels = acceptedLabelsByZone.get(zone) || new Set();
      const legacyIsHeadwear = legacy?.display_zone_label === "Headwear" || isHeadwearIdentity(legacyObjectType);
      if (!MARKET_HEADWEAR_PUBLICATION_ENABLED && legacyIsHeadwear) return [];

      const legacyIdentityAccepted = legacyObjectType ? acceptedLabels.has(legacyObjectType) : true;
      if (legacyIdentityAccepted) return [[zone, legacy]];

      const reconciliation = acceptedPublicationByZone.get(zone) || null;
      if (!reconciliation?.selected_label) return [];
      if (!MARKET_HEADWEAR_PUBLICATION_ENABLED && isHeadwearIdentity(reconciliation.selected_label)) return [];
      const displayMetadata = inferAccessoryDisplayMetadata([reconciliation.selected_label]);
'''
if old not in text:
    raise SystemExit('assist accessory publication anchor missing')
text = text.replace(old, new, 1)
path.write_text(text)

Path('test/headwearMarketSuppressionV6.test.js').write_text(r'''import test from "node:test";
import assert from "node:assert/strict";

process.env.NODE_ENV = "test";
delete process.env.HEADWEAR_MARKET_PUBLICATION_ENABLED;
const { buildOutfitAnalysis } = await import("../src/server.js");

function image(width, height, painter) {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const [r,g,b] = painter(x,y); const i=(y*width+x)*4;
    data[i]=r; data[i+1]=g; data[i+2]=b; data[i+3]=255;
  }
  return { width, height, data };
}

test("market assist suppresses headwear card even when perception accepts a strong hat candidate", () => {
  const decodedImage = image(80, 100, (x,y) => {
    if (x >= 20 && x < 60 && y >= 4 && y < 30) {
      if (y < 18) return x % 6 < 3 ? [18,18,22] : [48,48,55];
      return [175,112,82];
    }
    return [215,195,170];
  });
  const regions = [{
    id:"strong-hat", source_type:"grounding_dino", zone:"accessory_jewelry",
    label:"hat", segment_label:"hat", category:"accessory", confidence:91, coverage:.10,
    bounding_box:{x:.25,y:.04,width:.50,height:.26}, dominant_hex:"#202024",
    region_colors:[{hex:"#202024",pct:.78,name:"Deep Black"}],
  }];
  const analysis = buildOutfitAnalysis({
    dominantHex:"#8B4A2B",
    topColors:[{hex:"#8B4A2B",pct:.5},{hex:"#284B35",pct:.3},{hex:"#151515",pct:.2}],
    segmentedRegions:regions,
    dinoGarmentRegions:[],
    decodedImage,
    perception_v6_mode:"assist",
    pipeline:{sam_enabled:false,dino_enabled:true},
  });
  const hatDecision = analysis.perception_v6.publication_decisions.find((d) => d.label === "hat");
  assert.equal(hatDecision?.published, true, "internal perception capability remains available");
  assert.equal(analysis.garment_zones.zones.accessory_jewelry, undefined, "market-facing garment card is withheld");
});
''')
