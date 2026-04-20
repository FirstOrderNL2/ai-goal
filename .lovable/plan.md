

The user wants me to verify the Accuracy page cycle progress UI on mobile and desktop. This requires the browser tool, which is available in default mode.

## Plan

1. Navigate to `/en/accuracy` at desktop viewport (1366x768), screenshot the cycle progress section, confirm it shows reviews vs next cycle (e.g. `255 / 1050`).
2. Resize to mobile viewport (390x844), screenshot the same section, confirm layout/labels remain correct.
3. Cross-check the displayed numbers against the latest `model_performance` row and the `prediction_reviews` HEAD count visible in network logs.
4. Report findings; if anything is off, flag it (no code edits unless a bug is found).

No code changes expected — pure verification.

