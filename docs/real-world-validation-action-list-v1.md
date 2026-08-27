# VisionCore Real-World Validation Action List V1

## Goal

Create defensible evidence for garment identity, ownership, color fidelity, multicolor/pattern handling, capture quality, and cross-photo consistency. Code tests do not replace this work.

## What the owner needs to obtain

- 20 to 30 known garments/accessories that may be photographed repeatedly.
- Solids: black, white, gray, brown, red, green, blue, beige, and muted colors.
- Difficult materials: denim, knit, satin/gloss, leather, textured fabric, metallic accessory, and translucent or sheer material.
- Difficult designs: stripes, checks, graphics, color blocks, small logos, and multicolor prints.
- Accessories: belt, shoes, bag, glasses, hat, necklace/chain, watch, and bracelet.
- Neutral gray/white reference card suitable for photography.
- Stable phone support or tripod.
- Neutral high-CRI lighting for the controlled captures.
- Ideally, a calibrated color-measurement device or access to a professional color reader for the physical-reference subset.
- At least three phone-camera models across the final dataset.

## Garment inventory

Assign a permanent `garment_id` to every item. Record:

- Category and subtype.
- Brand/SKU if known.
- Material and finish.
- Solid, patterned, graphic, or multicolor state.
- Physical measurement locations.
- Whether a physical reference measurement exists.
- Consent/ownership and retention status.

Use `evaluation/physical-ground-truth-template.csv` for the first inventory.

## Physical color measurements

For the calibrated subset:

1. Let the garment lie flat without folds or direct glare.
2. Calibrate the measurement device according to its instructions.
3. Measure at least three representative interior locations per color field.
4. Avoid seams, shadows, printed borders, wear, and highlights unless they are the target field.
5. Store raw LAB readings, device name, device calibration time, illuminant/observer setting if available, operator, and notes.
6. Preserve disagreement; do not average a visibly heterogeneous textile into a false single color.
7. Adjudicate the reference value before VisionCore output is viewed.

## Photograph matrix

Collect at least 100 adjudicated outfit images covering the required cells in `evaluation/golden-benchmark-v1.json`.

For repeated garments, capture:

- Controlled neutral lighting with reference card.
- Daylight near a window without direct sun.
- Ordinary indoor warm lighting.
- Low light/shadow.
- Simple and busy backgrounds.
- Full-body and closer garment framing.
- Layered and overlapping pieces.
- Multiple phone cameras.
- One intentionally poor/filtered capture for rejection testing; label it explicitly and do not mix it into good-capture ground truth.

Keep original files. Do not use screenshots, social-media downloads, or edited exports as the primary benchmark source.

## Annotation and adjudication

1. Two annotators independently label every visible piece, zone, ownership, pattern, single/multicolor state, and expected primary/secondary colors.
2. Neither annotator sees VisionCore's result.
3. An adjudicator resolves disagreement or preserves `uncertain` as valid ground truth.
4. Link the final annotation to the original image ID and pipeline/model versions.
5. Run VisionCore only after ground truth is locked.

## Direct competitor evaluation

Use the same permitted image in each product and record:

- Every detected garment/accessory.
- Color result and whether it changes across repeated photos.
- Pattern and multicolor result.
- Whether confidence, evidence, or retake guidance is shown.
- Whether the result can be corrected.
- Latency and price/run limitations.

Do not reverse-engineer competitors or violate their terms. Record only user-visible outputs from authorized use.

## Release thresholds

- Overall reliability at least 0.90.
- Garment identity accuracy at least 0.92.
- Ownership accuracy at least 0.95.
- Zone color fidelity at least 0.90.
- Multicolor accuracy at least 0.95.
- Pattern accuracy at least 0.90.
- Zero benchmark regressions.
- External semantic harm rate of zero before promotion from shadow.

Run `npm run benchmark:readiness` after each catalog update. A nonzero exit is intentional while required evidence is incomplete.

## Privacy and data handling

- Obtain explicit evaluation consent from outside testers.
- Offer a documented retention/deletion choice.
- Separate identity/contact information from benchmark annotations.
- Restrict original images to authorized evaluators.
- Never add tester images to a public repository.
- Record the license/consent source for every image.

## Items that cannot be completed in code

- Taking original photographs under controlled and uncontrolled conditions.
- Measuring physical garments.
- Recruiting outside testers and annotators.
- Obtaining consent and retention choices.
- Establishing ground truth before VisionCore sees it.
- Running authorized competitor comparisons.
- Entering protected OpenAI credentials and observing live shadow-mode behavior.
- Patent-counsel review and deadline management.
