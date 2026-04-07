

# Enhance & Fix Football Prediction System

## Issues Found

**Score-Probability Inconsistency**: Multiple upcoming matches show the highest probability pointing to Home Win, but the predicted score is a draw (e.g., Rayo Vallecano 40% home win but predicted 1-1; Meppen 40% home win but predicted 0-0). This is because the statistical engine uses the **most probable single scoreline** (Poisson mode), which for tight matches is often a draw — even when cumulative home win probability is highest.

**Stale AI-Override Predictions**: 4 matches still have `home_win=0.100, draw=0.450` — old AI-generated values that were never refreshed with Poisson.

**Best Picks Too Obvious**: "Over 1.5" at 82-84% appears frequently — falls within the 55-85% window but is still trivially obvious.

**No Self-Consistency Validation**: The AI can return a score that contradicts the probabilities, and nothing corrects it.

## Plan

### Step 1: Score-Probability Consistency Enforcement
**Files**: `generate-statistical-prediction/index.ts`, `generate-ai-prediction/index.ts`

In the statistical engine (lines 222-229), after computing the most probable scoreline, add a consistency check:
- If `poissonHW` is highest but `bestScore.h <= bestScore.a`, adjust the score: find the most probable scoreline **where home wins** (e.g., 1-0 or 2-1).
- If `poissonAW` is highest but `bestScore.a <= bestScore.h`, find the most probable scoreline **where away wins**.
- If `poissonDR` is highest, keep draw scorelines.

In the AI prediction (after line 945), add the same consistency enforcement to `pred.predicted_score_home/away` — if AI returns a score contradicting the statistical probabilities, override the score to match.

### Step 2: Input Data Validation
**File**: `generate-statistical-prediction/index.ts`

Add validation after `calcStats()` (line 174):
- Clamp `wAvgScored` and `wAvgConceded` to [0, 5.0] (no team scores >5 per game on average).
- Clamp `lambdaHome` and `lambdaAway` to [0.3, 4.0] (already done on line 199-200, keep it).
- Validate form string length: if `home_form_last5` has >5 characters, truncate.
- If `cleanSheets > played`, cap at `played`.

### Step 3: Raise Best Pick Minimum Threshold
**File**: `generate-statistical-prediction/index.ts` (line 56)

Change the goal line best pick range from `v >= 0.55 && v <= 0.85` to `v >= 0.55 && v <= 0.80`. Also exclude Over/Under 0.5 and Over/Under 1.5 entirely — these are trivially obvious. Only consider Over/Under 2.5, 3.5, 4.5 as candidates.

### Step 4: Competition-Specific Adjustments
**File**: `generate-statistical-prediction/index.ts`

After computing `poissonHW/DR/AW` (line 211), apply league-type adjustments:
- For Champions League / Europa League / international: boost draw probability by 3%, reduce the highest of HW/AW by 3%.
- For lower leagues (Keuken Kampioen Divisie, etc.): apply stronger regression toward league mean (reduce lambda extremes by 10%).

### Step 5: Confidence Level Labels in UI
**File**: `src/components/AIVerdictCard.tsx`

Replace the numeric confidence display with labeled tiers:
- ≥70%: "High 🟢"
- 40-69%: "Medium 🟡"  
- <40%: "Low 🔴"

Keep the numeric value as a tooltip.

### Step 6: Remove Duplicate Reasoning Sections
**File**: `generate-ai-prediction/index.ts` (lines 996-1013)

The reasoning text currently has both `🔑 KEY FACTORS:` (from `pred.key_factors`) and `🎯 KEY FACTORS:` (from `pred.highlight_key_factors`) — these are duplicative. Remove the first `🔑 KEY FACTORS:` block and keep only the structured `🎯 KEY FACTORS:` section.

### Step 7: Batch-Fix Stale Predictions
**File**: `generate-statistical-prediction/index.ts`

No code change needed — we'll invoke `generate-statistical-prediction` for the 4 matches that still have stale `0.100/0.450` AI values, which will overwrite them with proper Poisson values.

## Files Summary

| File | Changes |
|---|---|
| `supabase/functions/generate-statistical-prediction/index.ts` | Score-probability consistency, input validation, better best picks, competition adjustments |
| `supabase/functions/generate-ai-prediction/index.ts` | Score consistency enforcement after AI, remove duplicate reasoning section |
| `src/components/AIVerdictCard.tsx` | Confidence tier labels (High/Medium/Low) |

## Expected Impact
- Zero score-probability contradictions
- Best picks become genuinely useful (no more "Over 1.5 at 83%")
- Draw probability more realistic for cup competitions
- Cleaner UI with no duplicate reasoning blocks
- Stale predictions replaced with proper Poisson values

