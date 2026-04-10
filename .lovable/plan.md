

# AI Learning & Improvement Evaluation — Findings + Implementation Plan

## Diagnosis: Is the AI Actually Learning?

### What EXISTS today

| Component | Status | Verdict |
|---|---|---|
| Past predictions stored | ✅ 131 completed matches with predictions | Working |
| Performance metrics computed | ✅ 17 `model_performance` rows spanning Jan–Apr 2026 | Working |
| Calibration data tracked | ✅ Bucket-level predicted vs actual rates | Working |
| Weak areas identified | ✅ Championship flagged at 26%, overconfidence detected | Working |
| AI reads performance data | ✅ `generate-ai-prediction` injects calibration warnings into prompt | Partial |
| Statistical model reads performance data | ❌ `generate-statistical-prediction` never queries `model_performance` | **BROKEN** |
| Feature weights applied to Poisson | ❌ Weights are text descriptions, never numeric adjustments | **BROKEN** |
| Accuracy improves over time | ⚠️ First-half: 7.8% → Second-half: 43.1% (but first half was stale AI-override data) | Inconclusive |
| Confidence calibration | ❌ High-confidence (≥70%) hits 50%, Medium (40-69%) hits 24%, Low (<40%) hits 40% — inverted | **BROKEN** |

### Root Problems

1. **The statistical engine is blind to its own mistakes.** `generate-statistical-prediction` never reads `model_performance`. It uses the same Poisson lambdas regardless of historical accuracy. The "learning loop" only exists as text injected into the AI prompt — the AI can read it but cannot change the math.

2. **Feature weights are descriptive, not actionable.** They say things like "Home wins 40% — moderate advantage" but are never converted into numeric adjustments applied to the Poisson model.

3. **Confidence is uncalibrated.** The 50-60% predicted probability bucket has a 41% actual hit rate, and the 80-90% bucket has 0% actual hits (2 matches). Medium-confidence predictions (the bulk) hit only 24%.

4. **No per-match learning log exists.** There's no record of "what we predicted vs what happened vs what went wrong" at the individual match level.

5. **No automatic feedback trigger.** `compute-model-performance` must be called manually — it's not triggered after match completion.

### Answer: The system is **NOT learning**. It collects data but never acts on it.

---

## Implementation Plan

### Step 1: Create `prediction_reviews` table (learning log)
**Migration**: New table that stores per-match post-prediction analysis.

```sql
CREATE TABLE prediction_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL,
  predicted_outcome text,
  actual_outcome text,
  outcome_correct boolean,
  ou_correct boolean,
  btts_correct boolean,
  score_correct boolean,
  confidence_at_prediction numeric,
  error_type text, -- 'overconfident_home', 'missed_draw', 'goals_overestimated', etc.
  goals_error numeric, -- MAE for this match
  league text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(match_id)
);
ALTER TABLE prediction_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view reviews" ON prediction_reviews FOR SELECT TO public USING (true);
```

### Step 2: Auto-populate `prediction_reviews` after match completion
**File**: `supabase/functions/batch-review-matches/index.ts`

After syncing completed matches, for each match with a prediction:
- Compare predicted outcome vs actual
- Classify error type (overconfident, missed draw, goals overestimated, etc.)
- Insert into `prediction_reviews`

### Step 3: Make `feature_weights` numeric and actionable
**Migration**: Add `numeric_weights` jsonb column to `model_performance`.

**File**: `supabase/functions/compute-model-performance/index.ts`

Compute numeric adjustments from historical accuracy:
- `home_bias_adjustment`: if home win predictions are systematically wrong → output a -0.03 to +0.03 multiplier
- `draw_calibration`: if draws are under/over-predicted → output adjustment
- `ou_calibration`: if O/U 2.5 is biased → adjust lambda scaling
- `confidence_deflator`: if high-confidence predictions hit <55% → apply a confidence penalty factor

### Step 4: Statistical engine reads and applies calibration
**File**: `supabase/functions/generate-statistical-prediction/index.ts`

Before computing final probabilities:
1. Query latest `model_performance` row
2. Read `numeric_weights`
3. Apply adjustments:
   - Shift Poisson HW/DR/AW probabilities by the calibration deltas
   - Scale confidence by `confidence_deflator`
   - Apply league-specific accuracy penalty (e.g., Championship → widen confidence interval)

### Step 5: Automatic feedback trigger
**File**: `supabase/functions/auto-sync/index.ts`

After syncing completed matches, automatically call:
1. `batch-review-matches` (populate prediction_reviews)
2. `compute-model-performance` (recalculate metrics with new data)

This closes the loop: sync → review → recalibrate → predict.

### Step 6: Enhanced Accuracy Dashboard
**File**: `src/pages/Accuracy.tsx`

Add:
- **Learning trend chart**: Plot outcome accuracy by week to show if it's improving
- **Confidence calibration scatter**: Predicted confidence vs actual hit rate (should be diagonal)
- **Error pattern table**: Most common error types from `prediction_reviews`
- **Per-league breakdown**: Accuracy by competition with sample sizes
- **Learning status indicator**: "Learning ✅" or "Static ⚠️" based on whether accuracy trend is positive

### Step 7: AI Self-Reflection in reasoning
**File**: `supabase/functions/generate-ai-prediction/index.ts`

When predicting a match, also query recent `prediction_reviews` for:
- Same teams (did we get their last match wrong?)
- Same league (systematic league bias?)

Inject this as "RECENT ERRORS" context so AI can reference specific past mistakes in its reasoning.

---

## Files Summary

| File | Action |
|---|---|
| Migration | Create `prediction_reviews` table, add `numeric_weights` to `model_performance` |
| `batch-review-matches/index.ts` | Auto-populate prediction_reviews for completed matches |
| `compute-model-performance/index.ts` | Add numeric weight computation |
| `generate-statistical-prediction/index.ts` | Read and apply calibration from model_performance |
| `generate-ai-prediction/index.ts` | Inject recent errors context |
| `auto-sync/index.ts` | Trigger review + recalibrate after sync |
| `src/pages/Accuracy.tsx` | Add learning trend, calibration scatter, error patterns |

## Expected Outcome
- Statistical model **actually adjusts** based on past accuracy (not just AI prompt text)
- Confidence scores become meaningful (calibrated to real hit rates)
- Per-match learning log enables error pattern detection
- Automatic feedback loop: no manual intervention needed
- Dashboard proves whether learning is happening with data

