

# GoalGPT System Health Check Report — April 12, 2026

## System Status: HEALTHY (with minor issues)

The critical crash from the previous health check (`generate-statistical-prediction` ReferenceError) is **fully resolved**. The system is operational end-to-end.

---

## Confirmed Stable

| Component | Status |
|-----------|--------|
| Edge functions (all) | No HTTP 500 errors in recent logs |
| `generate-statistical-prediction` | Responding correctly (404 for invalid input, no crashes) |
| `sync-football-data` | Active, 6,963 API calls remaining today |
| `pre-match-predictions` | Running, generating predictions (latest: 16:10 UTC today) |
| Live match tracking | 8 legitimate live matches being tracked |
| SEO URLs | All corrected to `goalgpt.io` (no `ai-goal.lovable.app` references) |
| Frontend console | No errors |
| Authentication | Operational |
| Database RLS | All tables properly configured |

---

## Coverage & Accuracy Snapshot

| Metric | Value | Trend vs Last Check |
|--------|-------|---------------------|
| Total predictions | 410 | +80 (was 330) |
| With AI reasoning | 196 (48%) | +2 (was 194) |
| Prediction reviews | 163 | +59 (was 104) |
| Upcoming without prediction | **267 of 467** | Improved (was 346/527) |
| Outcome accuracy (1X2) | **43.6%** | +1.3pp (was 42.3%) |
| O/U 2.5 accuracy | **57.1%** | +2.3pp (was 54.8%) |
| BTTS accuracy | **55.8%** | +2.9pp (was 52.9%) |
| Exact score hits | **14.1%** | +2.6pp (was 11.5%) |
| Avg goals error | **1.93** | -0.04 (was 1.97) |
| Confidence range | 0.01–0.78 (avg 0.528) | 2 outliers below 0.10 remain |

All accuracy metrics are trending upward since the model recalibration.

---

## MEDIUM Issues (Should Fix)

### 1. 267 upcoming matches still lack predictions
The backfill is progressing (~15 per batch run) but 267 matches remain uncovered. At the current pace, it would take ~18 more batch runs to complete. Accelerating by triggering `pre-match-predictions` multiple times would close the gap faster.

**Fix:** Trigger `pre-match-predictions` 5-10 times in sequence to accelerate backfill.

### 2. Two legacy predictions with confidence 0.01
These were generated before the 0.10 floor was added. They won't self-correct since the prediction already exists.

**Fix:** SQL update to clamp: `UPDATE predictions SET model_confidence = 0.10 WHERE model_confidence < 0.10`

### 3. Championship league accuracy at 25.7% (35 matches)
The model recalibration added a `league_penalty_championship: -0.093` weight, which deflates confidence but doesn't directly improve outcome accuracy. The league may need stronger regression-to-mean for Poisson lambdas.

**Fix:** In `generate-statistical-prediction`, increase the lambda regression factor for Championship (currently 10% reduction for low-accuracy leagues, could increase to 15-20%).

### 4. La Liga accuracy at 37.5% (16 matches)
Below benchmark, though sample size is still small. Worth monitoring.

**Action:** No immediate fix — monitor as review count grows.

---

## MINOR Issues (Nice to Fix)

### 5. React Router v6 deprecation warnings
`v7_startTransition` and `v7_relativeSplatPath` future flags should be set to silence warnings before eventual v7 migration.

### 6. Only 48% of predictions have AI reasoning
196 of 410 predictions have `ai_reasoning` populated. The rest are stats-only. This may be by design (AI enrichment is conditional), but users may expect reasoning on every prediction.

---

## Implementation Plan

### Step 1: Accelerate prediction backfill
Trigger `pre-match-predictions` multiple times to cover the 267 missing upcoming matches.

### Step 2: Fix legacy low-confidence predictions
Run a database migration to clamp `model_confidence` to minimum 0.10 for existing records.

### Step 3: (Optional) Strengthen Championship league regression
Adjust the lambda regression factor in `generate-statistical-prediction` for leagues with persistently low accuracy.

---

## Summary

The platform is in significantly better shape than the last check. The critical edge function crash is resolved, accuracy metrics are all improving, and predictions are being generated actively. The main gap is the backfill speed for the 267 uncovered upcoming matches, which can be resolved by accelerating batch runs.

