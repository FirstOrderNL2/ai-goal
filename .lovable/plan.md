

# Enrich AI Predictions with API-Football Data

## Overview

The API-Football v3 API has several endpoints that provide structured, real-time data that the AI currently gets via a less reliable web-search approach. We will integrate three key API-Football endpoints directly into the AI prediction pipeline to provide hard data alongside the existing web context.

## Key API-Football Endpoints to Use

1. **`/injuries`** — Current injuries by team/league/fixture (player name, type, reason)
2. **`/fixtures/lineups`** — Confirmed lineups (available 20-40 min before kickoff, or after match)
3. **`/predictions`** — API-Football's own prediction data (win %, goals, form, comparison stats)
4. **`/fixtures/statistics`** — Match statistics for completed matches (shots, possession, cards)
5. **`/fixtures/events`** — Goals, cards, substitutions for completed matches

## Plan

### 1. Add new endpoints to the proxy whitelist

**File: `supabase/functions/get-football-data/index.ts`**
- Add `/injuries` and `/sidelined` to the allowed endpoints list (they're not whitelisted today)

### 2. Create a new function to fetch structured API-Football context

**File: `supabase/functions/fetch-match-context/index.ts`** (modify existing)

Currently this function only uses AI web search. Enhance it to also call API-Football endpoints directly for hard data before the AI call:

- If match has `api_football_id`, fetch from API-Football:
  - `/injuries?fixture={id}` — injured/doubtful players for this specific fixture
  - `/fixtures/lineups?fixture={id}` — confirmed lineups if available
  - `/predictions?fixture={id}` — API-Football's own prediction with team comparison stats (attack, defense, form, etc.)
- If match only has team `api_football_id`s (no fixture ID), use:
  - `/injuries?league={id}&season={year}` — current injuries by league
  - Filter to relevant teams
- Prepend this structured data to the prompt so the AI gets verified facts, not just web-searched guesses
- Keep the existing AI web search as a fallback/supplement for info API-Football doesn't cover (weather, transfer rumors, morale)

### 3. Update sync to store `api_football_id` on Sportradar-created matches

**File: `supabase/functions/sync-sportradar-data/index.ts`**

Currently Sportradar-created matches have no `api_football_id`. Add a step that tries to match them to API-Football fixtures by team names and date, so the enrichment in step 2 can work.

Alternatively, update `sync-football-data` to also add Bundesliga (78) and Ligue 1 (61) league IDs, so API-Football fixtures are synced for all 5 leagues and matched via `api_football_id`.

### 4. Enrich post-match reviews with match statistics

**File: `supabase/functions/generate-post-match-review/index.ts`**

For completed matches with `api_football_id`, fetch:
- `/fixtures/statistics?fixture={id}` — possession, shots, passes
- `/fixtures/events?fixture={id}` — goals, cards, subs timeline

Include this structured data in the post-match review prompt so the AI can compare its prediction against actual match events.

### 5. Update sync-football-data with all 5 leagues

**File: `supabase/functions/sync-football-data/index.ts`**

Add Bundesliga (`id: 78`) and Ligue 1 (`id: 61`) to the `LEAGUES` array so API-Football fixtures are available for all leagues, not just PL/La Liga/Serie A.

## File Changes Summary

| File | Change |
|---|---|
| `supabase/functions/get-football-data/index.ts` | Add `/injuries`, `/sidelined` to whitelist |
| `supabase/functions/fetch-match-context/index.ts` | Call API-Football for injuries, lineups, predictions before AI web search |
| `supabase/functions/sync-football-data/index.ts` | Add Bundesliga + Ligue 1 league IDs |
| `supabase/functions/generate-post-match-review/index.ts` | Fetch match statistics + events for completed matches |
| `supabase/functions/generate-ai-prediction/index.ts` | Pass `api_football_id` to context function |

No database migrations needed.

