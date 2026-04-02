

# Enhance AI Reasoning + Deep Match Detail Page

## Summary

Upgrade the AI prediction engine to use weighted feature composition and richer API-Football data, then redesign the `/match/:id` page to present deep, actionable insights with better visual hierarchy and new UI components.

## Part 1: AI Reasoning Enhancement

### 1A. Upgrade `generate-ai-prediction` edge function

The function already has strong bones (Poisson model, odds comparison, validation, tool calling). Enhancements:

- **Fetch team_statistics from DB** — the function currently computes stats from raw match rows but ignores the `team_statistics` table which has richer data (form string, home/away records). Query it and merge.
- **Fetch players** — query the `players` table for both teams, include in the prompt (squad size, key positions).
- **Weighted feature prompt** — restructure the system prompt to explicitly instruct the AI to weight features: Recent Form (35%), H2H (15%), Offensive/Defensive Stats (25%), Home/Away Advantage (15%), Market Odds (10%). Add competition-type awareness (international matches get different weights — less H2H weight, more form).
- **Anomaly detection** — add a new tool parameter `anomalies` (array of strings) for the AI to flag when its prediction conflicts with market odds or when data is insufficient. Store in `ai_reasoning`.
- **Enhanced data quality scoring** — factor in player data availability and team_statistics presence.

### 1B. Upgrade `compute-features` edge function

- Fetch and include H2H data from completed matches (currently only preserves existing h2h_results, doesn't compute them).
- Compute home-only and away-only form separately (currently only computes overall form).

**File**: `supabase/functions/generate-ai-prediction/index.ts`
**File**: `supabase/functions/compute-features/index.ts`

## Part 2: Match Detail Page Redesign

### 2A. New `TeamComparisonCard` component

Side-by-side visual comparison of both teams:
- Form visualization (colored W/D/L pills — already exists but will be extracted into its own card)
- Goals for/against bars (horizontal bar chart using div widths)
- League position comparison
- Clean sheet % and BTTS % comparison bars

### 2B. New `GoalDistributionChart` component

Simple CSS-based bar chart showing goal frequency distribution for each team (0, 1, 2, 3+ goals scored/conceded per match) computed from `match_features` data.

### 2C. Enhanced H2H section

Replace current plain list with a richer card:
- Summary line: "Team A leads 3-1 (1 draw) in last 5 meetings"
- Each result with score, date, and venue indicator
- Total goals trend

### 2D. Restructured page layout

Reorder sections for better flow:

1. **Match Header** (existing, keep)
2. **AI Verdict** (existing, keep — already excellent)
3. **Team Comparison** (new — form, stats, positions side-by-side)
4. **Prediction Probabilities** (existing, keep)
5. **Goal Distribution** (new)
6. **Head-to-Head** (enhanced)
7. **Match Intelligence** (existing injuries/suspensions/weather)
8. **AI Commentary** (existing AIInsightsCard — keep)
9. **Odds + Market Edge** (existing, enhanced with value highlighting)

Remove: FunFactsCard, MatchInsightsCard, StatsBombSection (Sportradar/StatsBomb data is deprecated in favor of API-Football).

### 2E. Over/Under & BTTS visual indicators

Add dedicated mini-cards showing:
- Over/Under 2.5 probability with a gauge-style indicator
- BTTS probability with reasoning snippet
- These exist in AIVerdictCard but deserve more prominence

## Files to Change

| File | Change |
|---|---|
| `supabase/functions/generate-ai-prediction/index.ts` | Add team_statistics + players queries, weighted prompt, anomaly detection |
| `supabase/functions/compute-features/index.ts` | Compute H2H from DB, home/away-specific form |
| `src/pages/MatchDetail.tsx` | Restructure layout, add new components, remove Sportradar sections |
| `src/components/TeamComparisonCard.tsx` | **New** — side-by-side team stats comparison |
| `src/components/GoalDistributionChart.tsx` | **New** — CSS bar chart for goal frequencies |
| `src/components/H2HCard.tsx` | **New** — enhanced H2H display with summary |
| `src/components/OverUnderCard.tsx` | **New** — dedicated O/U and BTTS visual |

## Technical Detail

```text
AI Prompt Weight Structure:
──────────────────────────
FEATURE WEIGHTS (instruct AI to apply):
├─ Recent Form (last 5):     35%  → home/away split
├─ Offensive/Defensive:      25%  → avg goals, xG, clean sheets
├─ H2H History:              15%  → last 5-10 meetings
├─ Home/Away Advantage:      15%  → home-only vs away-only records
└─ Market Odds:              10%  → implied probabilities

International match override:
├─ Recent Form:              40%
├─ Squad Quality:            25%
├─ H2H:                     10%
├─ Home Advantage:           15%
└─ Market Odds:              10%
```

```text
Match Detail Page Layout:
┌─────────────────────────────┐
│  Match Header (teams/score) │
├─────────────────────────────┤
│  AI Verdict (winner/score/  │
│  BTTS/O-U/market edge)      │
├──────────────┬──────────────┤
│  Home Stats  │  Away Stats  │  ← TeamComparisonCard
│  Form: WWDLW │  Form: LWWDL │
│  GF: ████░░  │  GF: ███░░░  │
│  GA: ██░░░░  │  GA: ████░░  │
│  Pos: #3     │  Pos: #12    │
├──────────────┴──────────────┤
│  Prediction Probabilities   │
├─────────────────────────────┤
│  O/U 2.5: 62% Over  │ BTTS │  ← OverUnderCard
├─────────────────────────────┤
│  H2H: Arsenal leads 3-1    │  ← H2HCard
│  2026: 2-1 │ 2025: 0-0 ... │
├─────────────────────────────┤
│  Match Intelligence         │
│  (injuries/suspensions)     │
├─────────────────────────────┤
│  AI Commentary (reasoning)  │
├─────────────────────────────┤
│  Odds + Market Edge         │
└─────────────────────────────┘
```

## Priority

1. AI reasoning upgrade (backend — immediate prediction quality improvement)
2. New frontend components (TeamComparison, H2H, OverUnder)
3. MatchDetail page restructure

