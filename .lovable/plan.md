

# Fix: On-Demand Prediction Generation from Match Detail Page

## Problem
The Atletico Madrid vs FC Barcelona match (today, 19:00 UTC) has an **incomplete prediction** — created April 2 with no AI reasoning, no predicted score, and placeholder probabilities (10%/45%/45%). The `generate-ai-prediction` function was called but the AI response likely failed, leaving a partial record. Subsequent `pre-match-predictions` runs skip it because a prediction row already exists.

## Solution
Two changes to ensure every match detail page shows a complete prediction:

### 1. On-demand prediction trigger in MatchDetail page
**File: `src/pages/MatchDetail.tsx`**
- After match data loads, check if the prediction is missing or incomplete (no `ai_reasoning` or `predicted_score_home` is null)
- If incomplete, automatically call `generate-ai-prediction` edge function for this match
- Show a loading skeleton on the AI Verdict card with "Generating prediction..." text while waiting
- Use a React Query mutation with a flag to prevent re-triggering on re-renders
- Cache the trigger state so it only fires once per page visit

### 2. Fix pre-match-predictions to retry incomplete predictions
**File: `supabase/functions/pre-match-predictions/index.ts`**
- In Phase A, also select matches where a prediction exists but `ai_reasoning IS NULL` (incomplete predictions)
- This ensures failed predictions get retried in the background batch process

### 3. AI Verdict loading state
**File: `src/components/AIVerdictCard.tsx`** (no change needed — already handles missing data)
- Add a new `AIVerdictGenerating` component or a prop to show a skeleton state while the prediction is being generated on-demand

## Technical Details
- The on-demand call uses `supabase.functions.invoke("generate-ai-prediction", { body: { match_id } })` 
- A `useRef` flag prevents duplicate calls on re-renders
- The query for prediction data auto-refetches after the mutation succeeds via `queryClient.invalidateQueries`
- The edge function already handles upsert on `match_id` conflict, so re-running it for an existing incomplete prediction will overwrite with complete data

