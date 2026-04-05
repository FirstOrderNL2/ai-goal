

# Smart Adaptive Request Strategy for API-Football

## Overview

Implement a match-phase-aware polling system that dynamically adjusts API request frequency based on how close each match is to kickoff and whether it's currently live. This replaces the current flat "quick vs full" approach with a granular, time-sensitive strategy.

## Current State

The system has two modes:
- **quick** (budget: 80 calls): fetches live fixtures + today/yesterday scores + upcoming per league
- **full** (budget: 250 calls): adds standings, team stats, H2H, predictions, players

Both run on a fixed schedule regardless of match timing. There is no awareness of *when* matches start relative to the sync execution.

## Architecture

```text
┌─────────────────────────────────────────────────┐
│              auto-sync orchestrator             │
│  Runs every 10 min via cron                     │
│  Determines effective mode per execution:       │
│  - Are any matches LIVE? → "live" mode          │
│  - Any within 1h? → "pre-match" mode            │
│  - Otherwise → "idle" mode                      │
│  Once daily at 06:00 UTC → "full" mode          │
└──────────────────┬──────────────────────────────┘
                   │
        ┌──────────▼──────────┐
        │ sync-football-data  │
        │ Receives mode +     │
        │ adapts budget &     │
        │ fetch strategy      │
        └─────────────────────┘
```

## Match Phases & Request Strategy

| Phase | Condition | API Behavior | Budget |
|-------|-----------|-------------|--------|
| IDLE | No matches within 2h, none live | Skip live fetch, only upcoming per league | 30 |
| PRE_MATCH | Match within 1h | Fetch lineups, refresh context | 50 |
| LIVE | Any match currently live | Aggressive live polling, events | 80 |
| FULL | Daily comprehensive (06:00 UTC) | Standings, stats, players, H2H | 250 |

## File Changes

### 1. `supabase/functions/auto-sync/index.ts`

Add smart mode detection before calling sync-football-data:

- Query DB for matches starting within 1h (`upcoming` + `match_date` within next 60 min)
- Query DB for any `live` / `1H` / `2H` / `HT` matches
- Determine effective mode:
  - If any live matches exist → `mode = "live"`
  - Else if any matches within 1h → `mode = "pre_match"`
  - Else → `mode = "idle"`
- The daily full sync (via separate cron or time check) overrides to `mode = "full"`
- Pass the detected mode to `sync-football-data`
- In `idle` mode, skip calling `sync-sportradar-data` and `pre-match-predictions` to save resources

### 2. `supabase/functions/sync-football-data/index.ts`

Extend the mode system from 2 modes to 4:

**Budget allocation per mode:**
- `idle`: budget=30 — P1 upcoming fixtures only (20 calls for leagues), skip live fetch
- `pre_match`: budget=50 — P0 live (1 call) + P0 today (1-2 calls) + P1 upcoming (20 calls) + lineups for imminent matches (up to 5 calls)
- `live`: budget=80 — same as current quick, with P0 live + today/yesterday + P1 upcoming + lineups
- `full`: budget=250 — unchanged (standings, team stats, H2H, predictions, players)

**Specific changes:**
- Accept 4 mode values: `idle`, `pre_match`, `live`, `full`
- In `idle` mode: skip the P0 live fixtures fetch entirely (no `/fixtures?live=...` call), skip today/yesterday fetch, only do P1 upcoming per league
- In `pre_match` mode: expand lineup fetch window from 2h to include all matches within 1h, increase lineup cap from 5 to 10
- In `live` mode: keep current behavior (P0 live + today + P1 upcoming)
- Add a `last_synced_at` check: if the function was called less than 2 minutes ago in `idle` mode, return early with a cache response to prevent wasted executions

### 3. Client-side polling (no changes needed)

The existing client-side polling is already well-configured:
- Live matches: 30s dashboard, 10s detail page, 5s for API fixture data
- Upcoming: 5 min refresh
- These are independent of the backend sync frequency

## Cron Schedule

Currently there should be a single cron job running auto-sync. The plan keeps this single entry point but makes it self-aware:

- **Every 10 minutes**: auto-sync runs, auto-detects mode based on DB state
- **Daily at 06:00 UTC**: auto-sync detects it's 06:00 and forces `full` mode
- When matches are live, the 10-minute cron provides backend data freshness. The client-side polling via `useFixtureData.ts` (which calls the API proxy directly) handles sub-minute live score updates independently.

## Expected Impact

| Scenario | Before (calls/sync) | After (calls/sync) |
|----------|---------------------|---------------------|
| No matches today | ~27 (quick) | ~20 (idle) |
| Match in 3 hours | ~27 (quick) | ~20 (idle) |
| Match in 30 min | ~27 (quick) | ~30 (pre_match) |
| Match live | ~27 (quick) | ~27 (live) |
| Daily full sync | ~200 (full) | ~200 (full) |
| Daily total (typical) | ~400-500 | ~250-350 |

