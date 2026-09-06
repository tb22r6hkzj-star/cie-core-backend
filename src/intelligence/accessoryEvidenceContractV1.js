const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));

const DIRECT_SPATIAL_SOURCES = new Set([
  "grounding_dino",
  "dino_detection",
  "sam_segment",
]);

function isExplicitIdentityRejection(entry = {}) {
  const validationDecision = String(entry?.validation_decision || entry?.validation?.decision || "")
    .trim()
    .toLowerCase();
  const rejectionScope = String(entry?.rejection_scope || entry?.validation?.rejection_scope || "")
    .trim()
    .toLowerCase();
  return entry?.identity_rejected === true
    || entry?.identity_state === "rejected"
    || entry?.validation?.identity_rejected === true
    || ["identity_rejected", "spatial_rejected", "scene_rejected"].includes(validationDecision)
    || ["identity", "spatial", "scene"].includes(rejectionScope);
}

function isExplicitIdentityChallenge(entry = {}) {
  return entry?.identity_challenged === true
    || entry?.identity_state === "challenged"
    || entry?.validation?.identity_challenged === true;
}

export function resolveAccessoryEvidenceV1({
  entry = {},
  type = "unknown",
  confidenceFloor = 0.5,
  targetedIdentity = false,
  measurementAccepted = false,
  pixelSupported = false,
  colorsAvailable = false,
} = {}) {
  const source = String(entry?.source || entry?.source_type || "");
  const directSpatialSource = DIRECT_SPATIAL_SOURCES.has(source);
  const confidence = clamp01(entry?.confidence);
  const rejected = isExplicitIdentityRejection(entry);
  const challenged = isExplicitIdentityChallenge(entry);

  // Identity authority is spatial. A sufficiently confident VisionCore-owned
  // detector/segmenter result can establish object identity independently of
  // whether later mask/color measurement succeeds. Measurement remains a
  // separate requirement for publishing color.
  const identitySupported = directSpatialSource
    && confidence >= clamp01(confidenceFloor);

  const identityState = rejected
    ? "rejected"
    : challenged
      ? "challenged"
      : identitySupported
        ? "confirmed"
        : "insufficient";

  const publishIdentity = identityState === "confirmed";
  const publishColor = publishIdentity
    && measurementAccepted
    && pixelSupported
    && colorsAvailable;

  const colorState = publishColor
    ? "measured"
    : publishIdentity
      ? "withheld"
      : "not_applicable";

  return {
    version: "accessory_evidence_contract_v1",
    type,
    source,
    confidence,
    direct_spatial_source: directSpatialSource,
    targeted_identity: targetedIdentity === true,
    measurement_accepted: measurementAccepted === true,
    pixel_supported: pixelSupported === true,
    colors_available: colorsAvailable === true,
    identity_state: identityState,
    color_state: colorState,
    publish_identity: publishIdentity,
    publish_color: publishColor,
    identity_authority_source: publishIdentity
      ? targetedIdentity
        ? "visioncore_targeted_spatial_detection"
        : "visioncore_spatial_detection"
      : null,
    color_authority_source: publishColor ? "visioncore_object_local_pixels" : null,
    external_color_authority: false,
    publication_reason: publishColor
      ? "identity_and_color_supported"
      : publishIdentity
        ? "identity_supported_color_withheld"
        : rejected
          ? "identity_explicitly_rejected"
          : challenged
            ? "identity_explicitly_challenged"
            : "insufficient_identity_evidence",
  };
}
