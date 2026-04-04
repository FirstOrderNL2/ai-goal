

# AI Self-Learning Loop + Performance Dashboard

## What Already Exists

- **Predictions table**: Already stores `match_id`, probabilities (1X2, O/U, BTTS), expected goals, goal lines, best pick — no schema changes needed
- **Post-match reviews**: `generate-post-match-review` edge function already computes Brier scores (1X2, O/U, BTTS), exact score hits, outcome hits, and stores `ai_accuracy_score` + `ai_post_match_review` on the `matches` table
- **Learning context**: `generate-ai-prediction` already fetches past reviews and injects "LEARNING FROM PAST PREDICTIONS" into prompts
- **Accuracy page**: Basic page at `/accuracy` showing 1X2 and O/U 2.5 accuracy with a match-by-match list
- **1,433 completed matches** with predictions available for evaluation; 518 already have post-match reviews

So the core pipeline (store → evaluate → feed back) already exists. What's missing:

1. **A `model_performance` table** to track metrics over time (not just per-match)
2. **Multi-goal-line accuracy tracking** (currently only tracks O/U 2.5)
3. **Calibration analysis** (does 70% predicted → ~70% actual?)
4. **Feature weight adjustment** based on historical accuracy patterns
5. **A proper performance dashboard** with trend graphs, calibration plots, and weak-area identification
6. **Automated batch review** trigger for completed matches without reviews

## Plan

### 1. Create `model_performance` table

New migration:

```sql
CREATE TABLE model_performance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start date NOT NULL,
  period_end date NOT NULL,
  total_matches integer DEFAULT 0,
  outcome_accuracy numeric DEFAULT 0,
  ou_25_accuracy numeric DEFAULT 0,
  btts_accuracy numeric DEFAULT 0,
  exact_score_hits integer DEFAULT 0,
  avg_brier_1x2 numeric DEFAULT 0,
  avg_brier_ou numeric DEFAULT 0,
  avg_brier_btts numeric DEFAULT 0,
  mae_goals numeric DEFAULT 0,
  calibration_data jsonb DEFAULT '{}',
  goal_line_accuracy jsonb DEFAULT '{}',
  feature_weights jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);
```

With public SELECT RLS.

### 2. Create `compute-model-performance` edge function

Runs weekly (via pg_cron) or on-demand. For all completed matches with predictions:

- Compute aggregate accuracy: 1X2, O/U 2.5, BTTS, exact score rate
- Compute Brier scores averaged over the period
- Compute MAE for expected goals vs actual goals
- Compute calibration buckets: group predictions by probability decile (0-10%, 10-20%, etc.), measure actual hit rate per bucket
- Compute goal-line accuracy for all 5 thresholds (0.5, 1.5, 2.5, 3.5, 4.5)
- Identify weak areas (e.g., "overestimates home advantage in away-strong leagues")
- Suggest feature weight adjustments based on which data sources correlated with better predictions
- Upsert into `model_performance`

### 3. Upgrade `generate-post-match-review` to batch mode

Add a new `batch-review` edge function (or extend existing) that:
- Finds all completed matches missing `ai_accuracy_score`
- Processes them in batches of 5 with delays to avoid rate limits
- Stores Brier scores directly in a new `brier_scores` JSONB column on `predictions` for faster querying

### 4. Enhance AI prediction prompt with performance-aware weighting

Update `generate-ai-prediction` to:
- Fetch the latest `model_performance` row
- If calibration shows over-confidence in certain ranges, add a calibration warning to the prompt
- If certain goal lines are consistently off, note that
- Dynamically adjust the weight block based on historical accuracy (e.g., if H2H has low predictive power, reduce its weight)

### 5. Overhaul the Accuracy page into a full Performance Dashboard

Replace the basic `/accuracy` page with a comprehensive dashboard:

**Summary Cards Row:**
- Overall 1X2 accuracy %
- O/U 2.5 accuracy %
- BTTS accuracy %
- Exact score hit rate
- Average Brier score
- MAE (goals)

**Accuracy Trend Chart:**
- Line chart showing weekly accuracy over time (from `model_performance`)

**Calibration Chart:**
- Scatter/line plot: predicted probability (x) vs actual frequency (y)
- Perfect calibration = diagonal line
- Shows where the model is over/under-confident

**Goal Line Accuracy Breakdown:**
- Bar chart for each goal threshold (0.5, 1.5, 2.5, 3.5, 4.5)
- Shows accuracy per line

**Weak Areas Panel:**
- Text insights: "Model overestimates draws by 8%", "Under 0.5 predictions are 15% less accurate"

**Match-by-Match Log** (existing, enhanced):
- Add Brier score per match
- Add goal line hit/miss indicators
- Color-code by accuracy

### 6. Schedule automated reviews

Add a pg_cron job that triggers `compute-model-performance` weekly and `batch-review` for unreviewed completed matches daily.

## Files to Change

| File | Change |
|---|---|
| `supabase/migrations/new` | Create `model_performance` table |
| `supabase/functions/compute-model-performance/index.ts` | **New** — aggregate metrics computation |
| `supabase/functions/batch-review-matches/index.ts` | **New** — batch post-match reviews |
| `supabase/functions/generate-ai-prediction/index.ts` | Add performance-aware weight adjustment |
| `src/pages/Accuracy.tsx` | Full dashboard overhaul with trend charts, calibration plot, goal-line breakdown |
| `src/hooks/useMatches.ts` | Add hook for `model_performance` data |

## Priority Order

1. `model_performance` table + `compute-model-performance` function (metrics foundation)
2. `batch-review-matches` function (fill gaps in reviewed matches)
3. Accuracy page dashboard overhaul (user-facing value)
4. Performance-aware prompt enhancement (closes the learning loop)
5. Scheduled automation via pg_cron

