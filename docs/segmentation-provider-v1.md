# Segmentation Provider V1

VisionCore uses one provider selector for every segmentation call: full-image
target masks, fallback auto-segmentation, correction passes, and accessory
micro-crops. This is a system-wide integration, not an outfit fixture.

## Runtime selection

- `VISIONCORE_SEGMENTATION_PROVIDER=auto` selects fal when `FAL_KEY` is set and
  otherwise keeps Replicate as primary.
- `VISIONCORE_SEGMENTATION_PROVIDER=fal` explicitly selects fal.
- `VISIONCORE_SEGMENTATION_PROVIDER=replicate` explicitly selects Replicate.
- `VISIONCORE_SEGMENTATION_FALLBACK_PROVIDER=replicate` retains Replicate as a
  bounded fallback after a fast fal failure. Both providers share the caller's
  original deadline; fallback cannot extend the transform budget.

## fal endpoints

- Target-conditioned masks: `fal-ai/sam-3-1/image`
- Generic/micro-crop masks: `fal-ai/sam2/auto-segment`

Model IDs can be changed through `FAL_TARGET_SEGMENTATION_MODEL` and
`FAL_AUTO_SEGMENTATION_MODEL` without changing code.

## Authority and safety

The provider receives a public image URL, a color-neutral physical-item prompt,
and an available detector box. It never supplies color identity or publication
authority. Returned masks must pass VisionCore's coverage, detector-overlap,
exclusive-owned-pixel, freshness, and correction gates before measured colors
can reach a customer response.

fal queue callbacks are accepted only from `https://queue.fal.run`. Provider
payload details and credentials are not exposed in response telemetry. Requests
use the caller's bounded deadline and a timed-out queue request is cancelled on
a best-effort basis.

## Activation

Set `FAL_KEY` only in the backend host's protected environment settings. With
the default `auto` mode, adding the key activates fal first and retains the
existing Replicate token as fallback. Confirm the selection through
`GET /api/debug/status`; the endpoint reports booleans and model IDs, never key
values.
