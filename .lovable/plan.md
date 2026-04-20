
# Verification Result: Phases 1–6 and Learning Status

## Verdict

The system is partially learning and most phases are implemented, but it is not yet a fully reliable closed-loop learning system.

The model is learning in the sense that completed-match reviews are being converted into persisted calibration weights, and new statistical predictions read those weights. However, Phase 5 has a validation gap: the holdout validator does not truly test every learned weight family, so it can approve or mark changes as marginal without fully proving that the updated model improves future predictions.

Also, this is statistical model learning, not LLM retraining. The AI reasoning model is not being fine-tuned. The deterministic Poisson/statistical engine learns calibration weights, while the AI layer adds reasoning and narrative.

---

## Phase-by-phase audit

### Phase 1: Learning trigger based on real review count
Status: Implemented correctly.

What is present:
- `compute-model-performance` uses `prediction_reviews` count as the learning trigger.
- It no longer relies only on completed match count.
- Current database state shows `281` prediction reviews.

Evidence:
- Latest model version stores `last_learning_match_count: 280`.
- `prediction_reviews` currently contains `281` rows.

Conclusion:
- Phase 1 is working.
- The next normal learning cycle will not run until enough new reviews exist unless forced.

---

### Phase 2: Confidence redesign
Status: Implemented correctly.

What is present:
- Confidence is tied to the actual top probability mass.
- Confidence is adjusted by:
  - data quality
  - league reliability
  - market agreement
  - volatility penalty
  - learned confidence deflator
  - calibration bucket correction
  - Football Intelligence confidence adjustment

Conclusion:
- Phase 2 is wired into new statistical predictions.
- The latest learned model has `confidence_deflator: -0.094`, so the learning loop is actively reducing overconfident predictions.

---

### Phase 3: Per-league lambda shifts
Status: Implemented correctly.

What is present:
- `compute-model-performance` calculates per-league signed xG error.
- It persists league-specific lambda shift weights.
- `generate-statistical-prediction` applies those shifts before computing probabilities.

Current learned examples:
- Premier League:
  - home lambda shift: `+0.082`
  - away lambda shift: `+0.032`
- La Liga:
  - home lambda shift: `+0.042`
  - away lambda shift: `-0.124`
- Keuken Kampioen Divisie:
  - home lambda shift: `+0.179`
  - away lambda shift: `-0.163`

Conclusion:
- Phase 3 is truly active.
- It changes expected goals before probabilities are generated, so it affects the actual prediction output.

---

### Phase 4: Two-sided draw calibration
Status: Implemented correctly, with one minor cleanup needed.

What is present:
- The learning loop calculates:
  - `draw_calibration_tight`
  - `draw_calibration_skewed`
- Prediction generation chooses the correct draw adjustment based on lambda difference.
- Current active weights:
  - `draw_calibration_tight: -0.031`
  - `draw_calibration_skewed: +0.06`

Conclusion:
- Phase 4 is active and being used.
- Minor cleanup: one code comment says tight matches are under-predicted, but the current learned value is negative, meaning the system is reducing tight-match draw probability. The math is correct; the comment should be clarified.

---

### Phase 5: True holdout validation
Status: Partially implemented, but not fully correct.

What is present:
- The function creates a 7-day holdout set.
- It compares new learned weights against previous weights.
- It uses a composite Brier score:
  - 1X2: 60%
  - O/U 2.5: 20%
  - BTTS: 20%
- It reverts weights if validation fails.

Current latest result:
- Model version: `8`
- Validation result: `marginal`
- Outcome accuracy: `43.8%`
- O/U 2.5 accuracy: `61.9%`
- BTTS accuracy: `53.7%`
- Average 1X2 Brier: `0.638`

Problems found:
1. Calibration corrections are read but not actually applied inside the holdout scoring function.
2. League lambda shifts are not truly re-simulated during validation.
3. O/U validation uses a rough proxy instead of recomputing probabilities from adjusted lambdas.
4. The validation is therefore not truly testing all weight families, even though the comments say it is.

Conclusion:
- Phase 5 exists but needs correction before it can be considered fully reliable.
- The current learning loop can persist weights, but its validation does not fully prove that those weights improve the model.

---

### Phase 6: Publish gate
Status: Implemented correctly for display, but not yet integrated into training quality control.

What is present:
- `predictions` has:
  - `publish_status`
  - `quality_score`
- `generate-statistical-prediction` writes both fields.
- UI hides predictions marked `low_quality`.
- Current prediction distribution:
  - `published`: 509
  - `low_quality`: 6
- Average low-quality score: `0.818`
- Average published score: `0.974`

Conclusion:
- Phase 6 is active for the user-facing UI.
- However, low-quality predictions are still included in the learning/review loop. That means the model can still train on predictions it decided were too weak to publish.

---

## Is the AI model truly learning?

Yes, but with important qualifications.

What is truly happening:
- Completed matches are reviewed.
- Errors are classified.
- Calibration weights are generated.
- Those weights are stored in `model_performance`.
- New predictions read the latest stored weights.
- At least 8 predictions have been generated after the latest model version was created, so the latest learned weights are being used.

What is not happening:
- The LLM is not being retrained.
- The holdout validator does not yet fully validate all learned changes.
- Low-quality predictions are not yet excluded from training.
- The system does not yet store enough validation metadata to explain why a model passed, failed, or was marginal.

Best description:
GoalGPT currently has a working statistical learning loop with persisted calibration, but it needs Phase 5 hardening and a training-quality gate before it can be called a robust self-learning model.

---

# Implementation Plan to Make Learning Fully Correct

## 1. Fix Phase 5 holdout validation

Update `compute-model-performance` so the holdout validator truly evaluates all learned weight families.

Changes:
- Apply `calibration_corrections` inside `scoreWeights`.
- Recompute 1X2 probabilities after applying:
  - home bias
  - draw calibration
  - tight/skewed draw calibration
  - error-based draw adjustments
  - league lambda shifts
- Recompute O/U 2.5 from adjusted lambdas instead of using the stored prediction side as a proxy.
- Recompute BTTS probability from adjusted lambdas instead of using only the stored yes/no label.
- Include confidence deflator in validation by evaluating calibrated probability quality.

Expected result:
- `validation_result` will actually reflect whether the new weights improve the model on unseen recent matches.

---

## 2. Add validation diagnostics to model performance records

Extend the stored model performance payload with validation details.

Add fields, likely as JSONB:
- `validation_metrics`
  - holdout sample size
  - old composite Brier
  - new composite Brier
  - improvement
  - validation window start/end
- `validation_weights_tested`
  - numeric weights tested
  - error weights tested
  - calibration corrections tested

Expected result:
- The Accuracy dashboard and backend logs can explain why the model passed, failed, or was marginal.

---

## 3. Exclude low-quality predictions from learning

Update the learning and review pipeline so withheld predictions do not pollute calibration.

Changes:
- In `batch-review-matches`, either skip predictions where `publish_status = 'low_quality'`, or mark the review as excluded from training.
- In `compute-model-performance`, ignore low-quality predictions when calculating:
  - accuracy
  - Brier scores
  - draw calibration
  - league lambda shifts
  - error weights
  - confidence calibration
- Keep a separate count of excluded low-quality predictions for monitoring.

Expected result:
- The model learns from predictions it was confident enough to publish, making displayed accuracy and training data consistent.

---

## 4. Fix the Phase 4 comment mismatch

Clarify comments around tight/skewed draw calibration.

Changes:
- Replace fixed wording like “tight matches are under-predicted” with neutral wording:
  - “tight matches receive a separate learned draw correction”
  - “positive values increase draw probability; negative values decrease it”
- Keep the existing math unchanged.

Expected result:
- Future maintenance will not misinterpret the sign of draw calibration weights.

---

## 5. Add an Accuracy dashboard learning panel

Surface the learning loop state in the UI.

Show:
- latest model version
- validation result
- total learning reviews
- latest holdout Brier improvement
- active learned weights
- published vs low-quality prediction count
- next learning trigger threshold

Expected result:
- It becomes visible whether the model is actually learning, stalled, regressing, or waiting for enough new completed matches.

---

## 6. Run an end-to-end verification cycle

After implementation:
1. Trigger review generation for completed matches.
2. Trigger model recalibration.
3. Confirm a new model version is created.
4. Confirm validation metrics are stored.
5. Generate fresh predictions.
6. Confirm those predictions used the latest model version’s weights.
7. Confirm low-quality predictions are hidden from the UI and excluded from training.

Expected result:
- A complete evidence chain from completed result → review → learned weights → validated model → fresh prediction → UI publish gate.

