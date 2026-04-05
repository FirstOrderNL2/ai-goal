

# Improve AI Prediction System: Gap Analysis & Enhancement Plan

## Current State Assessment

Your system already implements **most** of the blueprint's architecture. Here's a layer-by-layer comparison:

| Blueprint Layer | Status | Notes |
|---|---|---|
| Data Layer (API-Football) | **Done** | Fixtures, teams, stats, lineups, H2H, events all collected and stored |
| Poisson Model | **Done** | Full implementation with league-specific averages, home/away split, score matrix |
| Probability Engine | **Done** | Goal lines 0.5-4.5, BTTS, 1X2, goal distribution — all Poisson-based |
| AI Explanation Layer | **Done** | 5-layer reasoning (Statistical, Feature, Context, Market, Contrarian) |
| Self-Learning Loop | **Done** | model_performance table, Brier scores, calibration, feature weights, weak areas fed back into prompts |
| Confidence System | **Done** | Blended from AI, data quality, model-market agreement, momentum |
| Web Research | **Done** | Firecrawl for injuries, news, lineups |
| Cost Optimization | **Partial** | Caching and pre-match refresh exist, but AI still generates core probabilities |

## Key Gaps to Fix

### Gap 1: AI generates core probabilities (violates cost rule)
Currently `generate-ai-prediction` asks the AI to produce `home_win`, `draw`, `away_win`, `expected_goals` — the blueprint says these should come purely from the statistical model. The AI should only adjust confidence and provide reasoning.

**Fix**: Use Poisson outputs as the final probabilities. AI provides reasoning + a small confidence adjustment, not the numbers themselves.

### Gap 2: No local prediction without AI
`batch-generate-predictions` and `generate-ai-prediction` both call the AI gateway for every match. The blueprint calls for predictions to work without AI calls.

**Fix**: Create a `generate-statistical-prediction` edge function that runs the Poisson engine and stores predictions without any AI call. AI reasoning becomes an optional enrichment step.

### Gap 3: AI "Thinking Process" UI missing
The blueprint calls for step-by-step animated progress showing each reasoning layer as it happens. Currently the UI shows a simple spinner ("Generating prediction... 20-30 seconds").

**Fix**: Add a thinking steps component that shows animated progress through the prediction pipeline stages.

### Gap 4: Batch predictions still use expensive model
`batch-generate-predictions` uses `google/gemini-2.5-pro` with `reasoning: high` for every match. This is the most expensive option.

**Fix**: Use the statistical engine for batch predictions (no AI). Reserve AI calls for on-demand single-match enrichment only, using `gemini-2.5-flash` instead of Pro.

### Gap 5: Compute features not triggered often enough
`compute-features` only runs during `full` mode (once daily at 06:00 UTC). New matches may not have features computed.

**Fix**: Also run compute-features during `pre_match` mode for imminent matches.

---

## Implementation Plan

### Step 1: Create statistical prediction function
New edge function `generate-statistical-prediction` that:
- Takes a match_id
- Computes Poisson xG using league averages (reuses existing logic)
- Calculates all probabilities, goal lines, BTTS, best pick
- Stores to `predictions` table WITHOUT calling AI
- Returns the prediction

This is essentially extracting the Poisson logic already in `generate-ai-prediction` lines 51-142 into its own standalone function.

### Step 2: Refactor batch predictions to be AI-free
Update `batch-generate-predictions` to call `generate-statistical-prediction` instead of the AI gateway. This eliminates AI costs for batch processing entirely.

### Step 3: Make AI enrichment optional and cheaper
Update `generate-ai-prediction` to:
- First run statistical prediction (or read existing)
- Only call AI for reasoning/explanation — pass the already-computed probabilities as context
- Switch from `gemini-2.5-pro` to `gemini-2.5-flash` (same quality for explanation, much cheaper)
- AI output: reasoning text, confidence adjustment (+-5% max), anomaly flags
- AI does NOT produce `home_win`, `draw`, `away_win` — those come from Poisson

### Step 4: Run compute-features in pre_match mode
Update `auto-sync` to call `compute-features` during `pre_match` and `live` modes too (not just `full`), ensuring fresh features for imminent matches.

### Step 5: Add AI Thinking Process UI
Create a `ThinkingSteps` component for the match detail page that shows animated progress:
1. "Fetching match data..."
2. "Analyzing team performance..."  
3. "Computing expected goals (Poisson)..."
4. "Calculating probabilities..."
5. "Running market analysis..."
6. "Generating AI insights..."
7. "Finalizing prediction..."

Each step transitions with a check mark animation. Steps 1-5 complete quickly (statistical), step 6 takes longer (AI call).

### Step 6: Improve pre-match-predictions cost efficiency
Update `pre-match-predictions` to only call AI when there's meaningful new data (confirmed lineups, significant odds movement). If nothing changed, just refresh the statistical model.

## Files to Create/Modify

| File | Action |
|---|---|
| `supabase/functions/generate-statistical-prediction/index.ts` | **Create** — standalone Poisson engine |
| `supabase/functions/generate-ai-prediction/index.ts` | **Modify** — AI for reasoning only, use flash model |
| `supabase/functions/batch-generate-predictions/index.ts` | **Modify** — call statistical engine instead of AI |
| `supabase/functions/pre-match-predictions/index.ts` | **Modify** — conditional AI calls |
| `supabase/functions/auto-sync/index.ts` | **Modify** — run compute-features in pre_match mode |
| `src/components/ThinkingSteps.tsx` | **Create** — animated prediction pipeline UI |
| `src/pages/MatchDetail.tsx` | **Modify** — integrate ThinkingSteps |
| `src/components/AIVerdictCard.tsx` | **Modify** — replace spinner with ThinkingSteps |

## Expected Cost Impact

- Batch predictions: **100% reduction** (no AI calls)
- Pre-match refreshes: **~70% reduction** (AI only when new data)
- On-demand predictions: **~60% reduction** (flash instead of pro, reasoning only)
- Overall: **~80-90% reduction** in AI gateway costs

## No Database Changes Required

All existing tables support this architecture. The `predictions` table already stores all necessary fields.

