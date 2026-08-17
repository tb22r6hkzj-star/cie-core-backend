# Color Evidence V3

Color Evidence V3 is a VisionCore-owned evidence-fusion and publication-authority layer for combining competing garment-color evidence without granting any single upstream provider automatic authority.

## Purpose

V2 proved that strong local pixel evidence can safely correct dark or shadow-contaminated raw primaries. V3 generalizes that lesson into an evidence-fusion policy that compares multiple independent evidence streams and then applies a separate publication-authority gate.

## Evidence sources

V3 currently evaluates three source classes:

- finalized garment identity;
- local pixel consensus from Color Evidence V1/V2;
- the leading raw color cluster.

Each source receives a reliability score based on the evidence available for that source. V3 groups colors that agree perceptually in LAB space and scores the combined support for each group.

## Supported fusion decision

A fused result is `supported` only when all of the following are true:

- the winning group reaches the minimum combined score;
- at least two independent source classes support the winning color group;
- the winner clears the runner-up by the minimum decision margin.

Otherwise the result remains `observed` or `conflicted`.

## Publication authority

`publicationPolicyV3.js` consumes the fused result and the current consumer resolution. It has three outcomes:

- `publish_v3`: a supported multi-source V3 winner may replace the current consumer color;
- `confirm_current`: V3 independently confirms the current consumer color and leaves it intact;
- `preserve_current`: the V3 authority gate is not met, so current V2/publication behavior remains in control.

The publication gate requires a supported fusion decision, winner score >= 0.72, decision margin >= 0.12, and at least two independent source classes.

## Architectural rule

Provider confidence is evidence, not authority. VisionCore owns the reliability policy, perceptual agreement rule, source independence requirement, decision margin, and publication threshold.

## Agile validation

The V3 fusion and publication-policy regressions have been executed together as one decision path. Eight focused tests pass: four fusion regressions plus four publication-authority regressions covering correction, confirmation, preservation, disagreement, and rejected finalized identity.

The available execution runtime could not install the repository's native `chroma-js` dependency, so the focused run used the unmodified V3 modules/tests with a compatibility implementation of the exact `hex()` and LAB `distance()` APIs those modules call. GitHub-native/full-suite validation remains the final merge gate.

## Remaining production wiring

The policy module is ready to be called from `resolveConsumerZonePrimary` after the current V2 resolution is computed. The intended call-site behavior is:

1. compute the existing V2/current resolution;
2. evaluate `evaluateColorPublicationV3({ zoneData, clusters, colorEvidence, currentResolution })`;
3. replace the current result only when the policy returns `publish_v3`;
4. otherwise preserve the existing result;
5. expose V3 fusion diagnostics inside `consumer_color_resolution` for auditability.

This should be a thin call-site change only. No threshold logic should be duplicated in `server.js`; the owned authority policy remains in `src/intelligence/colorEvidence/publicationPolicyV3.js`.
