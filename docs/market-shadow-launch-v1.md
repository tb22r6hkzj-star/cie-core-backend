# VisionCore Market Shadow Launch V1

## Runtime position

The market build activates external semantic intelligence in `shadow` by default. OpenAI can identify garment/accessory types, patterns, material cues, and possible ownership conflicts. It cannot change VisionCore color math, masks, garment ownership, scores, or publication.

Poor captures with a `retake` disposition do not call OpenAI. Missing or invalid OpenAI credentials skip cleanly and preserve the core VisionCore result.

## Protected production configuration

Set these through the hosting provider's protected environment-variable interface:

- `OPENAI_API_KEY`
- `VISIONCORE_EXTERNAL_INTELLIGENCE_MODE=shadow`
- `OPENAI_SEMANTIC_MODEL=gpt-5.6-luna`

Never put the key in GitHub, source files, browser code, ordinary AI chat, logs, or database rows.

## Market telemetry to retain

- Pipeline and semantic model version.
- Capture-quality disposition.
- Provider called/skipped/cached state.
- Provider latency and estimated cost.
- Provider failure reason without credential/configuration contents.
- VisionCore/external agreement or conflict disposition.
- Confirmation that `publication_changed` remains false.
- Corrections stored separately from the immutable original result.

## Non-negotiable gates

- Keep OpenAI in `shadow` during initial market evidence collection.
- Never advertise ordinary-photo output as physically verified color.
- Do not promote OpenAI to `assist` until the benchmark reports zero semantic harm.
- Do not hard-enable capture-quality publication blocking until real-image thresholds are calibrated.
- Failed internal/provider work does not consume a customer analysis credit.
