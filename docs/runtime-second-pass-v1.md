# Runtime Second Pass V1

The second pass is conditional, not universal. Normal analyses with convergent truth or sufficiently strong VisionCore evidence do not pay the retry cost.

## Latency policy

- Default total second-pass budget: 12 seconds.
- Per executor cap: 7 seconds.
- One retry maximum.
- If less than 500 ms remains in the budget, skip further retry work and preserve the current result.
- Strong VisionCore measurement favors semantic reassessment instead of redundant pixel remeasurement.
- Weak measurement plus strong semantic disagreement may trigger targeted VisionCore remeasurement.

These are hard ceilings rather than expected added latency. Real production telemetry should be used to reduce them after observing provider and local-model performance.

## Customer experience

- No second pass when evidence already converges.
- Compact card explanations are generated from the synthesis result and do not require another provider call by themselves.
- If a retry cannot complete within budget, the existing VisionCore result remains intact and the response may surface uncertainty rather than blocking indefinitely.
