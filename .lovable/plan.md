

# System Audit + Next Phase Plan

## Current State Summary (April 1, 2026)

### Database Stats
- **2,920 total matches**: 2,447 completed + 473 upcoming
- **285 teams**: 174 have logos, **111 missing logos** (mostly World Cup placeholder teams like "W74", "1F", "3B/3E/3F")
- **1,411 predictions**: ALL have `expected_goals = 0.0` and `over_under_25 = "under"` — Sportradar only provides 3-way probabilities, not xG or O/U
- **0 odds** in the database (no odds API connected)
- **0 AI insights** generated, **0 post-match reviews**, **0 accuracy scores**
- **26 of 473 upcoming matches** have predictions — the nearest 20 upcoming matches have **zero predictions**

### What is Working
- Sportradar sync: matches, teams, and 3-way probabilities for 5 domestic leagues + WCQ UEFA/CONMEBOL/CONCACAF + World Cup 2026
- Homepage loads with league filters, 20 upcoming / 12 completed limits
- Match detail page with prediction display, H2H, AI insights button
- Edge functions: `generate-ai-prediction`, `generate-post-match-review`, `fetch-match-context`, `fix-team-logos` all deployed
- 174/285 teams have Wikipedia logo URLs

### What is NOT Working / Critical Bugs

| # | Issue | Impact |
|---|---|---|
| 1 | **Top 20 upcoming matches have NO predictions** | Users see match cards with no probabilities — the core feature is missing |
| 2 | **All 1,411 predictions have xG = 0.0 and O/U = "under"** | Sportradar doesn't provide xG; the UI shows "xG: 0.0 - 0.0" which is misleading |
| 3 | **0 AI insights ever generated** | The AI analysis feature exists but has never been triggered automatically |
| 4 | **0 post-match reviews / accuracy scores** | The learning loop exists in code but has never run |
| 5 | **111 teams missing logos** | World Cup placeholder teams ("W74", "1F") + some national teams (Norway, Morocco, Algeria) |
| 6 | **"Friendlies" filter button exists but no Friendlies data** | Friendlies were removed from Sportradar sync but the filter button remains |
| 7 | **Broken logo images** | Screenshot shows broken `<img>` for Toulouse FC — some Wikipedia SVG URLs may not render |
| 8 | **WCQ matches all marked "completed"** | 0 upcoming WCQ matches despite qualifiers still running — season IDs may be for finished campaigns |

---

## Next Phase Plan

### Phase 1: Fix Critical Data Gaps (immediate)

**1a. Generate predictions for upcoming matches**
- Create a new edge function `batch-generate-predictions` that:
  - Queries the next 20 upcoming matches that have NO prediction
  - For each, calls the AI gateway to generate proper probabilities, xG estimates, and O/U 2.5
  - Uses tool calling to extract structured output (home_win, draw, away_win, xG_home, xG_away, over_under)
  - Upserts into the `predictions` table
- This replaces the Sportradar-only probabilities with AI-enriched predictions that include real xG estimates

**1b. Fix xG display**
- In `MatchCard.tsx`: hide the xG line when both values are 0 (don't show "xG: 0.0 - 0.0")
- In `generate-ai-prediction`: when generating insights, also update the prediction row with AI-estimated xG

**1c. Remove "Friendlies" filter**
- Remove from `LeagueFilter.tsx` since no Friendlies data exists

**1d. Fix broken logo images**
- Add `onError` handler to `<img>` tags in `MatchCard.tsx` and `MatchDetail.tsx` to show team initials as fallback
- Re-run `fix-team-logos` for national teams missing logos (Norway, Morocco, Algeria, etc.)

### Phase 2: Activate the AI Learning Loop

**2a. Auto-generate post-match reviews**
- After each Sportradar sync, automatically call `generate-post-match-review` for the 5 most recently completed matches that don't have a review yet
- Add this as a step at the end of `sync-sportradar-data`

**2b. Auto-generate pre-match AI insights**
- After sync, call `generate-ai-prediction` for the next 5 upcoming matches missing insights
- This populates the AI analysis that users see on match detail pages

### Phase 3: Improve Prediction Quality

**3a. AI-powered prediction function**
- New edge function that uses the AI gateway with tool calling to produce structured predictions
- Input: team form (last 5 results from DB), head-to-head history, league position, home/away record
- Output: structured JSON with calibrated probabilities, xG estimates, and O/U prediction
- This replaces Sportradar's static probabilities with context-aware AI predictions

**3b. Confidence calibration**
- Currently `model_confidence` = max(home_win, draw, away_win) which is just a repeat of the highest probability
- Replace with actual calibration: compare past predictions vs outcomes to compute a reliability score

### Files to Change (Phase 1)

| File | Change |
|---|---|
| `supabase/functions/batch-generate-predictions/index.ts` | New: AI-powered batch prediction generator for upcoming matches |
| `src/components/MatchCard.tsx` | Hide xG when both = 0; add img onError fallback |
| `src/components/LeagueFilter.tsx` | Remove "Friendlies" entry |
| `src/pages/MatchDetail.tsx` | Add img onError fallback for team logos |

### Files to Change (Phase 2)

| File | Change |
|---|---|
| `supabase/functions/sync-sportradar-data/index.ts` | After sync, trigger batch AI predictions + reviews for recent matches |

No database migrations needed.

