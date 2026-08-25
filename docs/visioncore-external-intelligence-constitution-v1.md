# VisionCore External Intelligence Constitution V1

> Nothing comes and veers into VisionCore's lane.

This constitution governs every current or future external AI provider used by VisionCore. Providers may contribute semantic evidence. They do not own the customer result.

## Non-delegable VisionCore authority

VisionCore alone owns:

- pixel, RGB, hex, LAB, Delta-E, percentage, and color-constancy measurements;
- masks, geometry, zone assignment, and spatial ownership;
- single-color and multicolor publication;
- signature, primary, secondary, and accent color publication;
- outfit scores, recommendation constraints, and final customer output;
- the evidence ledger, evaluation baseline, and conflict resolution history.

## Permitted external assistance

An external provider may propose:

- garment and accessory identities;
- pattern and material cues;
- possible ownership conflicts, such as belt or footwear pixels appearing in a trouser region;
- a targeted reanalysis request;
- an abstention;
- customer-facing language constrained to already-published VisionCore evidence.

External output is advisory, sanitized, logged, and passed through a VisionCore-owned gate.

## Prohibited external behavior

An external provider must never:

- replace or manufacture a color measurement;
- publish, reject, collapse, or expand a garment palette;
- convert a multicolor garment to single-color or the reverse;
- override a confirmed VisionCore decision;
- create a customer score or recommendation outside VisionCore constraints;
- receive authority merely because its confidence value is high;
- become required for core analysis completion;
- trigger repeated calls when a customer changes a display mode or reopens a cached result.

## Conflict hierarchy

1. Confirmed VisionCore evidence wins; disagreement is logged.
2. Uncertain VisionCore evidence plus a strong semantic conflict requests targeted reanalysis.
3. External agreement supports confidence only; it does not create publication authority.
4. If both systems are uncertain, VisionCore abstains.
5. Provider failure fails open to the existing VisionCore result.

## Multicolor invariant

A semantic pattern claim cannot manufacture a second color. A semantic `solid` claim cannot erase a spatially coherent, materially distinct, garment-owned second color. VisionCore's measured ownership evidence controls both outcomes.

## Deployment modes

- `off`: no external call or influence.
- `shadow`: record structured observations and conflicts; never affect publication.
- `assist`: permit targeted reanalysis requests; still never permit direct publication changes.

There is deliberately no external `authoritative` mode.

## Cost and reliability limits

- Maximum one normal semantic call per completed image analysis.
- Maximum one escalation call for a genuine conflict.
- Maximum external-AI budget of $0.03 per analysis.
- Eight-second external timeout.
- Cache by image hash, VisionCore pipeline version, provider model, and schema/prompt version.
- Internal retries and external failures do not consume customer analysis credits.

## Change control

Any change to these authority boundaries must update this constitution, the executable policy, and its regression tests in the same pull request. A provider integration is incomplete unless the full serial suite remains green.
