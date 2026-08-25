# VisionCore Outside Tester Validation V1

## Completion rule

This work item is not complete because the protocol exists. It is complete only after real outside-user data satisfies the gates below.

## Cohort

- 25 to 50 outside testers who did not build VisionCore.
- At least 100 adjudicated outfit images.
- Multiple skin tones, phone cameras, lighting conditions, backgrounds, garment types, accessories, solids, and multicolor patterns.
- Explicit consent for evaluation use and a documented retention/deletion choice.

## Blind evaluation

1. Preserve the original image and pipeline/model versions.
2. Two annotators independently label pieces, ownership, primary colors, patterns, and single/multicolor state.
3. An adjudicator resolves disagreements or records `uncertain` as valid truth.
4. VisionCore runs without seeing the annotations.
5. OpenAI remains in `shadow` and cannot change publication.
6. Reviewers classify each semantic observation as `helped`, `neutral`, or `harmed` against adjudicated truth.

## Technical release gates

- Overall reliability >= 0.90.
- Garment identity accuracy >= 0.92.
- Ownership accuracy >= 0.95.
- Zone color fidelity >= 0.90.
- Multicolor accuracy >= 0.95.
- Pattern accuracy >= 0.90.
- Zero benchmark regressions.
- External semantic harm rate = 0 before `assist` promotion.

## Product validation gates

- At least 70% of testers complete a second session.
- At least 50% save one look to the archive.
- At least 30% revisit a saved look on a later day.
- Satisfaction average >= 4.2/5.
- Regret/cancellation-intent average <= 1.8/5.
- Tester comments are stored separately from technical ground truth.

## Required report

The final report must state cohort size, image count, dataset coverage, every technical metric, retention behaviors, satisfaction, failures, unresolved uncertainties, pipeline version, external model version, and whether the release remains `shadow` or qualifies for `assist`.
