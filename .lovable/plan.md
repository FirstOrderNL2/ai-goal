

# Enhance AI with Lineups/Bench + Live Data + Match Page Upgrade

## Current State

- **`fetch-match-context`** already fetches `/fixtures/lineups` and `/injuries` from API-Football when `api_football_id` is available, but does NOT fetch bench players or live match events
- **`generate-ai-prediction`** receives lineup/injury data via `fetchMatchContext()` but doesn't directly query the live API for in-play status
- **`get-football-data`** proxy already whitelists `/fixtures`, `/fixtures/lineups`, `/fixtures/events`, `/fixtures/players` — can be used from frontend
- **Match detail page** shows static predictions but has no live score polling or lineup display
- **`match_context`** table stores `lineup_home`/`lineup_away` as JSONB — already supports structured lineup data

## Plan

### Part 1: Backend — Fetch Lineups + Bench + Live Events

#### 1A. Upgrade `fetch-match-context` to include bench players

Currently `extractLineups()` only processes `startXI`. Add bench extraction from `l.substitutes` array (same API response). Store as `{ starters: [...], bench: [...], formation: "4-3-3" }` in `lineup_home`/`lineup_away`.

**File**: `supabase/functions/fetch-match-context/index.ts`
- Update `extractLineups()` to include `substitutes` from each lineup entry
- Change output shape to `{ team, formation, starters: [], bench: [] }`

#### 1B. Add live match events fetching to `fetch-match-context`

When `api_football_id` exists, also fetch:
- `/fixtures?id={api_football_id}` — for live status, elapsed minutes, current score
- `/fixtures/events?fixture={api_football_id}` — for goals, cards, substitutions

Add these to the parallel fetch block. Format into context text for AI. Store key events in a new field or merge into `news_items`.

**File**: `supabase/functions/fetch-match-context/index.ts`

#### 1C. Upgrade `generate-ai-prediction` to include lineup quality assessment

Add to the system prompt: instructions to evaluate starting XI vs bench strength, flag missing key players, and adjust prediction if lineups are confirmed. Already has `playersBlock` — enhance to note which squad players are in the starting XI vs bench.

**File**: `supabase/functions/generate-ai-prediction/index.ts`

### Part 2: Frontend — Live Data + Lineups on Match Page

#### 2A. New `LineupsCard` component

Display for each team:
- Formation (e.g., "4-3-3")
- Starting XI in a list with shirt numbers and positions
- Bench players in a secondary section
- Visual indicator for captain

Uses the `get-football-data` proxy to fetch `/fixtures/lineups?fixture={api_football_id}` directly from the frontend. Falls back to `match_context.lineup_home`/`lineup_away` from DB.

**File**: `src/components/LineupsCard.tsx` (new)

#### 2B. New `LiveMatchCard` component

For live/in-play matches:
- Current score with elapsed time badge
- Key events timeline (goals, cards, subs) from `/fixtures/events`
- Auto-refresh every 30 seconds using `refetchInterval`

For upcoming matches: hidden. For completed matches: show final events summary.

**File**: `src/components/LiveMatchCard.tsx` (new)

#### 2C. New `useFixtureData` hook

Frontend hook that calls `get-football-data` proxy:
- `useLineups(apiFootballId)` — fetches `/fixtures/lineups`
- `useLiveFixture(apiFootballId)` — fetches `/fixtures?id=X` with 30s refetch for live matches
- `useFixtureEvents(apiFootballId)` — fetches `/fixtures/events`

**File**: `src/hooks/useFixtureData.ts` (new)

#### 2D. Update `MatchDetail.tsx` page layout

Add new sections:
- **Live score** (between header and AI Verdict) — only for live matches
- **Lineups** (after Team Comparison) — starters + bench
- **Match Events** (after Lineups for live/completed) — timeline of goals, cards, subs

Updated order:
1. Match Header (existing)
2. Live Score + Events (new — live matches only)
3. AI Verdict (existing)
4. Team Comparison (existing)
5. Lineups (new)
6. Prediction Probabilities (existing)
7. Over/Under & BTTS (existing)
8. Head-to-Head (existing)
9. Match Intelligence (existing)
10. AI Commentary (existing)
11. Odds & Market Edge (existing)

**File**: `src/pages/MatchDetail.tsx`

### Part 3: Enhanced MatchContextCard with lineups

Update existing `MatchContextCard` to render lineups from DB when available (formation + starters list). This is the fallback when API-Football live data isn't directly fetched.

**File**: `src/components/MatchContextCard.tsx`

## Files to Change

| File | Change |
|---|---|
| `supabase/functions/fetch-match-context/index.ts` | Extract bench from lineups, fetch live events |
| `supabase/functions/generate-ai-prediction/index.ts` | Add lineup quality assessment to prompt |
| `src/hooks/useFixtureData.ts` | **New** — hooks for lineups, live fixture, events |
| `src/components/LineupsCard.tsx` | **New** — starters + bench display |
| `src/components/LiveMatchCard.tsx` | **New** — live score + events timeline |
| `src/pages/MatchDetail.tsx` | Add LineupsCard, LiveMatchCard, reorder sections |
| `src/components/MatchContextCard.tsx` | Render lineups from DB as fallback |

## Technical Detail

```text
API-Football endpoints used:
├─ /fixtures/lineups?fixture=X    → startXI + substitutes (bench)
├─ /fixtures/events?fixture=X     → goals, cards, subs timeline
├─ /fixtures?id=X                 → live status, elapsed, score
├─ /injuries?fixture=X            → (already used)
└─ /predictions?fixture=X         → (already used)

Lineup data shape (upgraded):
{
  team: "Arsenal",
  formation: "4-3-3",
  starters: [{ name, number, pos }],
  bench: [{ name, number, pos }]
}

Live polling:
- Frontend: 30s refetchInterval for useQuery when match status is "live"
- Only active when user is on the match detail page
```

