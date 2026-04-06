

# Hybrid AI Prediction with Statistical Backbone & Live Research

## Problem Summary
The AI prediction function (`generate-ai-prediction`) still asks the AI to produce `home_win`, `draw`, `away_win`, and `expected_goals` (lines 896-899), then uses those AI-generated values as final output (lines 966-969, 1031-1035). This violates the hybrid architecture where statistical probabilities should be the source of truth. Live research via Firecrawl already exists in `fetch-match-context` but its results aren't surfaced transparently in the prediction output.

## Changes

### 1. Fix: Remove probability fields from AI tool schema
**File**: `supabase/functions/generate-ai-prediction/index.ts`

Remove `home_win`, `draw`, `away_win`, `expected_goals_home`, `expected_goals_away` from the `predict_match` tool schema (lines 896-900) and from `required` (line 913-914).

Add new fields to the schema:
- `confidence_adjustment` (number, -0.10 to +0.10)
- `contrarian_note` (string, optional)
- `highlight_key_factors` (array of strings)
- `live_data_sources` (array of strings -- sources the AI referenced)

After AI response, read the existing statistical prediction from DB and use its Poisson values as the final `home_win`, `draw`, `away_win`, `expected_goals_home/away`, `goal_lines`, `goal_distribution`. AI only contributes: reasoning text, predicted score, BTTS, confidence adjustment, and anomalies.

Update the upsert block (lines 1029-1046) to use statistical values instead of AI values:
- Read the statistical prediction row for this match_id
- Use its `home_win`, `draw`, `away_win`, `expected_goals_home/away`, `goal_lines`, `goal_distribution`
- Apply `confidence_adjustment` from AI as a delta on the blended confidence
- Store `live_data_sources` and `highlight_key_factors` in the `ai_reasoning` text

Update the confidence blend (lines 1008-1013) to remove `aiConfidence * 0.45` and replace with:
- 50% data quality
- 30% model-market agreement  
- 20% prediction certainty (how decisive the max probability is)
- Then apply AI's `confidence_adjustment` as a clamp-limited delta

### 2. Enhance: Live web research integration in AI prompt
**File**: `supabase/functions/generate-ai-prediction/index.ts`

The `fetchMatchContext` call already scrapes via Firecrawl (injuries, lineups, news). Enhance the system prompt to instruct the AI to:
- Reference which live sources it used in `live_data_sources`
- Highlight how live context (injuries, lineup changes) affects reasoning
- Never modify probabilities, only reasoning and confidence

Add to the user prompt: explicit instruction to list sources in `live_data_sources` and key factors in `highlight_key_factors`.

### 3. Enhance: Broader live research in fetch-match-context
**File**: `supabase/functions/fetch-match-context/index.ts`

Add a third Firecrawl search query for English press conference / team news:
- `"{homeName} OR {awayName} press conference team news today"`
This broadens coverage beyond Dutch sources.

Increase the per-search result limit from current behavior to capture more signals. Truncate combined output to 6000 chars (up from 4000) to give AI more context.

### 4. Surface live sources in UI
**File**: `src/components/AIInsightsCard.tsx`

Parse the `ai_reasoning` field for the `📡 LIVE DATA SOURCES:` section (added in step 1). Display source URLs/descriptions as small badges or links below the reasoning text so users see transparency.

### 5. Update pre-match-predictions for conditional AI enrichment
**File**: `supabase/functions/pre-match-predictions/index.ts`

In Phase A2 (AI enrichment), only call AI when there's meaningful new context:
- Check if `match_context.scraped_at` is newer than `predictions.last_prediction_at`
- Check if lineups have been confirmed (lineup_home is not empty)
- If neither condition is met, skip the AI call to save costs

## Technical Details

**Tool schema change** (generate-ai-prediction):
```
// REMOVE from schema:
home_win, draw, away_win, expected_goals_home, expected_goals_away

// ADD to schema:
confidence_adjustment: { type: "number", description: "Small adjustment -0.10 to +0.10" }
highlight_key_factors: { type: "array", items: { type: "string" } }
live_data_sources: { type: "array", items: { type: "string" } }
contrarian_note: { type: "string" }
```

**Upsert logic change**: After AI call, fetch the existing statistical prediction and merge:
```
const { data: statPred } = await supabase.from("predictions").select("*").eq("match_id", match_id).maybeSingle();
// Use statPred.home_win, statPred.draw, statPred.away_win, etc. as final values
// Only take reasoning, predicted_score, btts from AI
```

## Files Summary

| File | Action |
|---|---|
| `supabase/functions/generate-ai-prediction/index.ts` | Fix AI override bug, new schema, statistical-first upsert |
| `supabase/functions/fetch-match-context/index.ts` | Add broader search query, increase context limit |
| `src/components/AIInsightsCard.tsx` | Surface live data sources in UI |
| `supabase/functions/pre-match-predictions/index.ts` | Conditional AI calls based on new context |

## Expected Impact
- Probabilities become purely mathematical (Poisson) -- no more AI noise
- AI focuses on what it's good at: reasoning, context, explaining "why"
- Live research sources are visible to users for transparency
- AI costs reduced ~60% further (conditional enrichment)
- 1X2 accuracy expected to improve from 47% toward 50%+ by eliminating AI probability noise

