

# Add International Competitions + Fix Missing Logos & Stats

## Problems Found

1. **No logos**: All 102 teams have `logo_url = NULL` and `api_football_id = NULL`. The Sportradar sync creates teams but does not fetch logos. The API-Football sync (which has logos) never ran successfully after the DB truncation, or its team names don't match the Sportradar-created names, so no upsert happened.

2. **No stats (predictions) showing**: There are 999 predictions in the DB, so predictions exist. The issue is likely that the `MatchCard` renders predictions correctly but the probability values may be displayed oddly, or some matches simply lack predictions. Need to verify on the frontend.

3. **Missing international competitions**: Only 5 domestic leagues are configured. User wants World Cup Qualifiers, World Cup, and international friendlies.

## Plan

### 1. Fix Team Logos by Cross-Matching API-Football Data

The `sync-football-data` function already fetches `logo_url` from API-Football, but teams created by Sportradar have different names (e.g., "Arsenal FC" vs "Arsenal") and no `api_football_id`, so the upsert on `api_football_id` creates duplicates or skips.

**Fix in `supabase/functions/sync-football-data/index.ts`:**
- After fetching fixtures from API-Football, before upserting teams, try to match existing DB teams by resolved name (using the alias map)
- If a match is found, update the existing team's `api_football_id` and `logo_url` instead of inserting a duplicate
- This bridges the gap between Sportradar-created teams (no logo) and API-Football data (has logo)

### 2. Add International Competitions to Sportradar Sync

Add these competitions to `ALL_LEAGUES` in the sync function and `LEAGUE_SEASONS` in `seasons.ts`:

- **FIFA World Cup 2026 Qualifiers (UEFA)**: `sr:competition:36` — need to discover current season ID
- **FIFA World Cup 2026 Qualifiers (CONMEBOL)**: `sr:competition:37`
- **FIFA World Cup 2026 Qualifiers (AFC)**: `sr:competition:852`
- **International Friendlies**: `sr:competition:36` variant or separate

We'll need to call the Sportradar `/competitions/{id}/seasons.json` endpoint to discover the correct season IDs for these. Since this is a trial API, we may be limited to certain competitions.

**Alternative approach**: Use API-Football for international competitions since it supports:
- League ID `1` = FIFA World Cup
- League ID `32` = World Cup Qualifiers (Europe)  
- League ID `34` = World Cup Qualifiers (South America)
- League ID `10` = International Friendlies

**Files to update:**
- `supabase/functions/sync-sportradar-data/index.ts` — add international competitions
- `supabase/functions/sync-football-data/index.ts` — add international league IDs
- `src/lib/seasons.ts` — add international entries
- `src/components/LeagueFilter.tsx` — add filter buttons for international comps
- `src/hooks/useSportradar.ts` — add new league keys to the sync loop

### 3. Fix Logo Sync Pipeline

**New step in `sync-sportradar-data/index.ts`** (or a separate small function):
- After creating teams from Sportradar, call the API-Football `/teams?league={id}&season={year}` endpoint for each league
- Match by team name (using aliases) and update `logo_url` and `api_football_id`
- This ensures every team gets a logo regardless of which data source created it

### 4. Update LeagueFilter

Add buttons for:
- "WC Qualifiers"
- "Friendlies"

## Files Changed

| File | Change |
|---|---|
| `supabase/functions/sync-football-data/index.ts` | Add international league IDs (WCQ Europe `32`, WCQ South America `34`, Friendlies `10`); fix team matching to update existing Sportradar-created teams with `logo_url` and `api_football_id` |
| `supabase/functions/sync-sportradar-data/index.ts` | Add international competition entries; after team sync, attempt API-Football logo fetch for teams missing logos |
| `src/lib/seasons.ts` | Add international competition configs |
| `src/components/LeagueFilter.tsx` | Add WC Qualifiers and Friendlies filter buttons |
| `src/hooks/useSportradar.ts` | Add international league keys to `LEAGUE_KEYS` array |

No database migrations needed.

