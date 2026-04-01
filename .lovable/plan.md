

# Enhance AI Predictions: Structured Output + Smarter Analysis + Better UI

## Problem

Looking at the screenshots, three issues are clear:

1. **The AI insights are just a wall of text** — no structured prediction summary (predicted winner, predicted score, BTTS yes/no, over/under verdict) is visible at a glance
2. **The predictions table only stores basic probabilities** — no predicted scoreline, no BTTS, no reasoning/justification
3. **The AI prompt asks for "flowing paragraphs"** — it should instead return structured, fact-based predictions that can be displayed as distinct UI sections

## Plan

### 1. Add structured prediction fields to the database

New columns on `predictions` table:
- `predicted_score_home` (integer) — e.g. 2
- `predicted_score_away` (integer) — e.g. 1
- `btts` (text) — "yes" or "no"
- `ai_reasoning` (text) — the full fact-based justification

This way the AI's verdict (winner, score, BTTS, over/under) is stored as data, not buried in prose.

### 2. Upgrade the AI prompt to require fact-based justification

**File: `supabase/functions/generate-ai-prediction/index.ts`**

Rewrite the prompt to demand:
- A clear verdict: who wins and why (backed by specific stats from the data provided)
- A predicted scoreline with reasoning (e.g. "Home averages 1.8 goals scored, away concedes 1.5 → expect 1-2 home goals")
- BTTS verdict with reasoning (e.g. "Both teams scored in 4/5 of their last matches")
- Over/under verdict with reasoning (e.g. "Combined avg goals per game: 3.1 → over 2.5")
- Use tool calling to return structured output (predicted_score, btts, over_under, reasoning sections) instead of free text
- Enable reasoning mode (`reasoning: { effort: "high" }`) for deeper analysis
- Increase max_tokens to 3000 for comprehensive justification

### 3. Upgrade batch predictions to include new fields

**File: `supabase/functions/batch-generate-predictions/index.ts`**

Add `predicted_score_home`, `predicted_score_away`, `btts` to the tool calling schema so the AI returns these with every prediction. Store them alongside existing prediction data.

### 4. Redesign the Match Detail page to show structured verdicts

**File: `src/pages/MatchDetail.tsx`** and **`src/components/AIInsightsCard.tsx`**

Add a new "AI Verdict" section between the prediction probabilities and the analysis text:

```text
┌─────────────────────────────────┐
│ 🏆 AI Verdict                   │
│                                 │
│ Predicted Winner: Chelsea Women │
│ Predicted Score:  2 - 1         │
│ BTTS:            Yes ✓          │
│ Over 2.5:        Over ✓         │
│ Confidence:      65%            │
│                                 │
│ ─── Why? ───────────────────── │
│ • Chelsea's home form: W W W   │
│   (avg 2.1 goals scored at home)│
│ • Arsenal concede 1.3 avg away │
│ • H2H: Chelsea won 3 of last 5 │
│ • Both teams scored in 4/5 each │
└─────────────────────────────────┘
```

The existing wall-of-text AI analysis stays below as "Detailed Analysis" for those who want more depth.

### 5. Show match_context data on match detail page

**File: `src/pages/MatchDetail.tsx`**

Query `match_context` table and display structured cards for:
- Injuries (home/away) — scraped from Firecrawl
- Confirmed/expected lineups
- Suspensions
- Weather

This data already exists in the DB but is never shown to the user.

## Files to Change

| File | Change |
|---|---|
| DB migration | Add `predicted_score_home`, `predicted_score_away`, `btts`, `ai_reasoning` to `predictions` |
| `supabase/functions/generate-ai-prediction/index.ts` | Rewrite prompt for structured, fact-based output with reasoning mode; save new fields |
| `supabase/functions/batch-generate-predictions/index.ts` | Add new fields to tool schema and DB upsert |
| `src/pages/MatchDetail.tsx` | Add AI Verdict section and match_context display (injuries, lineups) |
| `src/components/AIInsightsCard.tsx` | Show structured verdict + fact-based reasoning sections |
| `src/lib/types.ts` | Add new Prediction fields |

