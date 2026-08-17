# Color Evidence V3

Color Evidence V3 is a VisionCore-owned shadow evaluation layer for combining competing garment-color evidence without granting any single upstream provider automatic authority.

## Purpose

V2 proved that strong local pixel evidence can safely correct dark or shadow-contaminated raw primaries. V3 generalizes that lesson into an evidence-fusion policy that can compare multiple independent evidence streams before a later package is allowed to use the result for publication.

## Evidence sources

V3 currently evaluates three source classes:

- finalized garment identity;
- local pixel consensus from Color Evidence V1/V2;
- the leading raw color cluster.

Each source receives a reliability score based on the evidence available for that source. V3 then groups colors that agree perceptually in LAB space and scores the combined support for each group.

## Supported decision

A fused result is `supported` only when all of the following are true:

- the winning group reaches the minimum combined score;
- at least two independent source classes support the winning color group;
- the winner clears the runner-up by the minimum decision margin.

Otherwise the result remains `observed` or `conflicted`.

## Architectural rule

Provider confidence is evidence, not authority. VisionCore owns the reliability policy, perceptual agreement rule, source independence requirement, decision margin, and publication threshold.

## Rollout

V3 is intentionally shadow-only in this package. It does not alter the public response contract or customer-facing garment color. Publication authority should only be granted after the fusion regressions and real-market evaluation set demonstrate that the new policy improves accuracy without creating new false corrections.

## Executed validation — August 17, 2026

The focused V3 regression suite was executed and passed 4/4 cases:

1. pixel consensus + finalized identity defeat a contaminated dark raw cluster;
2. finalized identity + raw cluster defeat one conflicting strong pixel source;
3. three-way disagreement does not receive supported authority;
4. rejected/inconsistent finalized identity is downweighted so agreeing pixel + raw evidence can win.

Execution note: external dependency installation timed out in the available runtime. The V3 source and regression test files were therefore executed unchanged with a local compatibility implementation of the two `chroma-js` operations used by V3 (`hex()` normalization and LAB `distance()`). This validates the V3 decision/fusion logic. The repository-native dependency/runtime and full `npm test` suite remain the final merge gate.
