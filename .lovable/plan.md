
# AI Prediction System Enhancement

## What's Already Working (No Changes Needed)
- ✅ Poisson distribution for all goal lines (0.5–4.5)
- ✅ 4-layer reasoning (Statistical → Features → Context → Market)
- ✅ Web research integration (Firecrawl-based news/injuries)
- ✅ Self-learning loop with calibration warnings
- ✅ Prediction validation and consistency checks

## Concrete Improvements

### 1. Home Advantage in Poisson Model (`compute-features` + `generate-ai-prediction`)
Current: Uses flat `leagueAvg = 1.35` for both teams.
Fix: Apply ~10% home boost / away reduction to Poisson lambdas, which is the standard in football analytics.

### 2. League-Specific Goal Averages (`compute-features`)
Current: Hardcoded `leagueAvg = 1.35` for all leagues.
Fix: Calculate actual league average goals from completed matches per league. Different leagues have very different scoring profiles (Eredivisie ~3.2 avg, Serie A ~2.6).

### 3. Match Importance Detection (`generate-ai-prediction`)
Current: No distinction between a group stage match and a cup final.
Fix: Parse `match.round` to detect finals, semi-finals, relegation battles, title deciders. Add importance factor to prompt and confidence scoring.

### 4. Momentum/Streak Detection (`generate-ai-prediction`)
Current: Form is shown as "W, W, D, L, W" but no streak analysis.
Fix: Detect winning/losing streaks, unbeaten runs, and momentum shifts. Add to prompt as structured data.

### 5. Better Value Pick Detection (`generate-ai-prediction`)
Current: `findBestPick` only looks at goal lines 55-85%.
Fix: Also evaluate 1X2 value (AI prob vs market implied) and BTTS value. Pick the market with the highest positive edge.

### 6. Structured News Signal Extraction (`generate-ai-prediction`)
Current: Live context is passed as raw text to AI.
Fix: Pre-process news signals into structured impact factors (e.g., "key striker out → reduce home xG by 15%") before sending to AI, so the AI has clearer actionable data.

### 7. Smarter Confidence Scoring (`generate-ai-prediction`)
Current: `confidence = AI_confidence * 0.6 + data_quality * 0.4`
Fix: Add Poisson-vs-market agreement factor. When statistical model agrees with market, confidence should be higher. When they disagree significantly, flag uncertainty.

### 8. Dynamic Feature Weight Feedback (`compute-model-performance`)
Current: `feature_weights` is always stored as `{}`.
Fix: After computing performance, analyze which prediction types are strongest/weakest and store recommended weight adjustments that feed back into the next prediction cycle.

### 9. Enhanced Prompt Engineering (`generate-ai-prediction`)
- Add explicit instructions for close matches (avoid defaulting to draws)
- Add tournament context awareness (knockout vs league)
- Require the AI to explicitly state what changed since last prediction (for refreshed predictions)
- Add "contrarian check" — force AI to argue against its own prediction before finalizing

### 10. Expanded Form Window (`generate-ai-prediction`)
Current: Last 5 matches overall + 5 home/away.
Fix: Also include last 10 for trend detection, and weight recent results higher (exponential decay).

---

## Files Changed
- `supabase/functions/generate-ai-prediction/index.ts` — Core prediction logic + prompt
- `supabase/functions/compute-features/index.ts` — Feature computation
- `supabase/functions/compute-model-performance/index.ts` — Performance feedback

## Expected Impact
- More accurate Poisson lambdas (league-specific + home advantage)
- Better context awareness (match importance, momentum)
- Smarter value detection across all markets
- More honest confidence scoring
- Self-improving weight system
