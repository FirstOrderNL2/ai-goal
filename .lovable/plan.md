

# AI Self-Learning Prediction System

## What We're Building

Two new capabilities that make the AI analyst smarter over time:

1. **Post-Match Review** — After a match completes, the AI automatically analyzes whether its prediction was right or wrong, explains why, and scores itself
2. **Learning Memory** — Past prediction reviews are fed back into future predictions so the AI avoids repeating mistakes

## Database Changes

Add two new columns to the `matches` table:
- `ai_post_match_review` (text) — stores the AI's self-assessment after the match
- `ai_accuracy_score` (numeric) — 0-100 score the AI gives itself for each prediction

## New Edge Function: `generate-post-match-review`

Triggered manually (button on match detail) or could be automated later. It:
1. Fetches the match result, the original `ai_insights` (pre-match prediction), the prediction probabilities, xG, and odds
2. Fetches the actual outcome (score, xG)
3. Builds a prompt asking the AI to:
   - Compare its prediction vs what actually happened
   - Grade itself (0-100 accuracy score)
   - Explain what it got right, what it missed, and what factors it underestimated
   - Note lessons for future predictions of similar matchups
4. Saves `ai_post_match_review` and `ai_accuracy_score` to the match

## Updated Edge Function: `generate-ai-prediction`

Enhanced to include a "learning context" section in the prompt:
1. Before generating a new prediction, query the last 10 completed matches that have `ai_post_match_review` 
2. Summarize the AI's recent accuracy (average score, common mistakes)
3. If any of those reviewed matches involved the same teams, include those specific lessons
4. Append this as a "LEARNING FROM PAST PREDICTIONS" section in the prompt so the AI self-corrects

## Updated UI: `AIInsightsCard`

Add a second section for completed matches:
- If match is completed and no post-match review exists: show a "Generate Post-Match Review" button
- If review exists: show the review text with the accuracy score as a colored badge (green 70+, yellow 40-69, red 0-39)
- Both pre-match prediction and post-match review are visible on the same card with clear separation

## Updated Types

Add `ai_post_match_review` and `ai_accuracy_score` to the `Match` interface in `src/lib/types.ts`.

## File Changes Summary

| File | Change |
|---|---|
| DB migration | Add `ai_post_match_review` text + `ai_accuracy_score` numeric to `matches` |
| `supabase/functions/generate-post-match-review/index.ts` | New edge function |
| `supabase/functions/generate-ai-prediction/index.ts` | Add learning context from past reviews |
| `src/components/AIInsightsCard.tsx` | Add post-match review UI section |
| `src/lib/types.ts` | Add two new fields to Match interface |

## How the Learning Loop Works

```text
Pre-match:
  [Past reviews + lessons] → AI prompt → prediction saved

Post-match:
  [Original prediction + actual result] → AI prompt → review + score saved
                                                          ↓
                                              Fed into next prediction
```

The AI doesn't train a model — it uses its own written reviews as "memory" that gets injected into future prompts, creating a natural feedback loop where it learns from mistakes in plain language.

