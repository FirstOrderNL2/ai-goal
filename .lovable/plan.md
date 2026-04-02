

# Fix Dashboard: Prioritize API-Football Data & Show Round Info

## Problem

The dashboard shows **854 upcoming matches** — nearly half are duplicates from multiple data sources (API-Football, Sportradar, scrapers). For example, La Liga has 180 upcoming matches but only 90 are from API-Football; the other 90 are Sportradar duplicates with different team IDs and no round info.

Additionally, there are duplicate team entries (e.g., "Real Sociedad" from API-Football and "Real Sociedad San Sebastian" from Sportradar), causing the same fixture to appear twice with different teams.

## Solution

### 1. Filter upcoming matches to prefer API-Football source

Update `useUpcomingMatches` in `src/hooks/useMatches.ts` to:
- For leagues covered by API-Football (Premier League, La Liga, Serie A, Bundesliga, Ligue 1), only show matches **with** `api_football_id` (accurate data with round info)
- For other leagues (UWCL, KKD, WCQ, etc.), show all matches as before
- This eliminates duplicates without needing to delete data

### 2. Database cleanup migration

- Delete the stale Friendlies match from Oct 2025
- Optionally: mark Sportradar-only duplicates for leagues covered by API-Football (can be done later)

### 3. Improve MatchCard round display

The `MatchCard` already shows `match.round` as a badge — this works. But improve formatting:
- Parse "Regular Season - 28" → "Matchday 28"
- Show "QF Leg 2" style for cup matches
- Make the badge more prominent

### 4. Increase match limit

The current limit of 20 upcoming matches is too low when filtering. Increase to 50 and let the frontend show more matches per league.

## Files to Change

| File | Change |
|---|---|
| `src/hooks/useMatches.ts` | Add `api_football_id` filter for covered leagues; increase limit |
| `src/components/MatchCard.tsx` | Format round text nicely (e.g., "Regular Season - 28" → "MD 28") |
| DB migration | Delete stale Friendlies match from 2025 |

## Technical Detail

```text
useUpcomingMatches query logic:
─────────────────────────────
if league is "all":
  → filter: api_football_id IS NOT NULL  (for covered leagues)
    OR league NOT IN (PL, LaLiga, SerieA, Buli, L1)
if league is a covered league (PL, LaLiga, etc.):
  → filter: api_football_id IS NOT NULL
if league is uncovered (UWCL, KKD, etc.):
  → no api_football_id filter (show all)
```

