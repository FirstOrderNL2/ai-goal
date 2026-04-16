

# GoalGPT Learning System — Deep Audit & Enhancement Plan

## Current Learning Architecture (Reverse Engineered)

```text
  Match Played → sync-football-data (scores)
       │
       ▼
  batch-review-matches → prediction_reviews table
       │                  (outcome_correct, error_type, confidence)
       ▼
  compute-model-performance → model_performance table
       │                       (numeric_weights, calibration, weak_areas)
       ▼
  generate-statistical-prediction ← reads numeric_weights
       │                             (home_bias, draw_cal, ou_adj, conf_deflator, league_penalty)
       ▼
  New prediction generated with adjusted weights
```

**How it works today**: The system does NOT retrain a model. It computes aggregate statistics over ALL completed matches (up to 1000), derives 5 numeric weight adjustments (`home_bias_adjustment`, `draw_calibration`, `ou_lambda_adjustment`, `confidence_deflator`, `league_penalty_*`), stores them in `model_performance`, and the statistical engine reads the latest weights at prediction time. This runs daily during `full` mode via `auto-sync`.

---

## Critical Findings

### 1. Weights Are NOT Being Applied (Bug)
The latest `model_performance` record shows `confidence_deflator: -0.07` and `draw_calibration: 0.03`. But `generate-statistical-prediction` line 527 forces `strengthenedDeflator = Math.min(confDeflator, -0.12)` — this hardcoded override means the learned deflator is always ignored. Similarly, line 434-438 applies a hardcoded `+0.05` global draw boost ON TOP of the learned `draw_calibration` — double-counting. **The learning loop's output is partially overridden by hardcoded values.**

### 2. No Model Versioning
There is no version tracking. Weights are overwritten each cycle. No way to compare v1 vs v2 or rollback.

### 3. No Temporal Weighting
`compute-model-performance` treats all 199 matches equally — a match from 3 months ago has the same weight as yesterday. Recent trends are diluted.

### 4. No Validation Before Deployment
New weights are immediately used. No holdout set, no comparison against previous weights, no "did this actually improve things?" check.

### 5. Error Learning Is Weak
`prediction_reviews` stores `error_type` (false_draw, missed_draw, etc.) but `compute-model-performance` doesn't read or use error_type distributions. It only computes draw_calibration from overall draw rates, not from specific error patterns.

### 6. Numeric Weights Are Stale
Looking at the last 5 performance records: `confidence_deflator` has been -0.07 to -0.081 and `draw_calibration` stuck at 0.03 for days. The formula computes weights over ALL matches, so new results barely shift the average.

### 7. Feature Importance Not Computed
`feature_weights` contains text descriptions ("Strong predictor") but no numeric importance scores that could actually reweight the model.

---

## Enhancement Plan

### Step 1: Fix the Double-Counting Bug
**File**: `generate-statistical-prediction/index.ts`
- Remove the hardcoded `globalDrawBoost = 0.05` (lines 434-438) — let the learned `draw_calibration` from `numeric_weights` be the sole draw adjustment
- Remove `strengthenedDeflator = Math.min(confDeflator, -0.12)` override — use the actual learned deflator, but set a floor of -0.15 only as a safety clamp
- This alone will make the learning loop's output actually matter

### Step 2: Add Temporal Weighting to Performance Computation
**File**: `compute-model-performance/index.ts`
- Apply exponential decay (0.95^weeks_ago) when computing accuracy metrics and numeric weights
- Recent matches contribute more to weight calculation
- Keep the full-sample metrics for reporting, but derive `numeric_weights` from the recency-weighted subset

### Step 3: Add Model Versioning
**Migration**: Add `model_version` (integer, auto-increment) column to `model_performance`
**File**: `compute-model-performance/index.ts`
- Always INSERT a new row instead of UPSERT on period dates
- Include a `model_version` counter
- Keep last 20 versions for comparison

### Step 4: Add Validation Layer (Before-After Check)
**File**: `compute-model-performance/index.ts`
- After computing new weights, simulate accuracy on the last 30 matches using both old and new weights
- Only publish new weights if they improve accuracy by ≥0.5pp OR don't degrade it
- Store `validation_result` (passed/failed/marginal) on the performance record
- If validation fails, carry forward previous weights

### Step 5: Error-Based Learning
**File**: `compute-model-performance/index.ts`
- Query `prediction_reviews` for error_type distribution
- If `false_draw` > 25% of errors → increase `draw_calibration` penalty
- If `missed_draw` > 20% → increase draw boost
- If `overconfident_home/away` > 10% → strengthen `confidence_deflator`
- Add `error_weights` to `numeric_weights`: `{ draw_overpredict_penalty, draw_underpredict_boost, overconfidence_penalty }`
**File**: `generate-statistical-prediction/index.ts`
- Read and apply these new error-derived weights

### Step 6: Scheduled Learning Cycles (Every 50 Matches)
**File**: `compute-model-performance/index.ts`
- Track `last_learning_match_count` in the latest record
- Only recompute weights when `total_matches - last_learning_match_count >= 50` OR when forced
- This prevents unnecessary micro-updates and makes changes more deliberate

### Step 7: Smart Data Weighting
**File**: `compute-model-performance/index.ts`
- Weight high-importance matches (match_importance > 0.7) at 1.5x in accuracy calculation
- Weight matches older than 60 days at 0.7x
- This naturally emphasizes recent high-stakes performance

### Step 8: Confidence Calibration Improvement
**File**: `compute-model-performance/index.ts`
- Compute per-bucket calibration adjustments (not just overall deflator)
- Store `calibration_corrections` map: `{ "40-50": -0.08, "50-60": -0.02, "60-70": -0.10 }`
**File**: `generate-statistical-prediction/index.ts`
- Apply bucket-specific correction based on the raw confidence value

---

## Files Changed

| File | Change |
|------|--------|
| `supabase/functions/generate-statistical-prediction/index.ts` | Remove hardcoded overrides, use learned weights, add per-bucket calibration |
| `supabase/functions/compute-model-performance/index.ts` | Temporal weighting, error-based learning, validation layer, versioning, 50-match cycles |
| New migration | Add `model_version`, `validation_result`, `last_learning_match_count` to `model_performance` |

## Expected Impact

| Enhancement | Expected Effect |
|-------------|----------------|
| Fix double-counting bug | Learned weights actually influence predictions |
| Temporal weighting | Faster adaptation to recent trends (currently diluted over 199 matches) |
| Error-based learning | Directly targets the 57% draw-error problem |
| Validation layer | Prevents regressions from bad weight updates |
| Per-bucket calibration | Fixes the 40-50% band (31% actual vs 45% predicted) |
| 50-match cycles | More deliberate, stable learning instead of daily noise |

