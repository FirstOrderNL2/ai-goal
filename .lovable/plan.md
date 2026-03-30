

# Integrate SportMonks as 4th Data Source

## What SportMonks Adds

SportMonks provides structured football data via `https://api.sportmonks.com/v3/football/`. Auth is via `api_token` query param or `Authorization` header.

Key endpoints from the docs you shared:
- **Standings by season**: `/standings/seasons/{ID}` — position, points, participant_id, with includes for `participant` (team details), `details` (W/D/L/GF/GA)
- **Schedules by team**: `/schedules/teams/{ID}` — stages → rounds → fixtures hierarchy for a team
- **Round by ID**: `/rounds/{ID}` — round metadata (name, dates, finished status)
- **Best practices**: Use `filters=populate` for bulk sync, `idAfter` for incremental sync, cache static entities (types, countries), use server-side proxy for CORS

SportMonks season IDs for current seasons (need to look up or fetch dynamically via `/seasons` endpoint):
- Premier League: league_id `8` (English Premier League in SportMonks)
- La Liga: league_id `564`
- Serie A: league_id `384`

## Plan

### Step 1: Store API Key
Use `add_secret` to store `SPORTMONKS_API_KEY`.

### Step 2: Create Edge Function — `get-sportmonks-data`
Proxy function following the same pattern as `get-sportradar-data` and `get-football-data`.

**Whitelisted endpoints:**
- `/standings/seasons/{id}` — standings with includes for participant + details
- `/schedules/teams/{id}` — team schedule
- `/rounds/{id}` — round info
- `/fixtures/{id}` — fixture details
- `/seasons/{id}` — season info
- `/leagues` — list leagues
- `/seasons` — list seasons (to dynamically find current season IDs)

Auth: Pass `api_token` as query param from `SPORTMONKS_API_KEY` secret.

### Step 3: Create `useSportMonks` Frontend Hook
Generic proxy hook similar to `useSportradarData` — calls the edge function with endpoint + params.

Specific hooks:
- `useSportMonksStandings(seasonId)` — fetch standings with `include=participant;details`
- `useSportMonksSchedule(teamId)` — team schedule

### Step 4: Add Standings Page
New `/standings` route showing league standings from SportMonks data. Include:
- Team position, name, points, W/D/L, GF/GA, GD
- League selector (Premier League, La Liga, Serie A)
- Uses the `include=participant;details` query to get full standings data in one call

### Step 5: Update Navigation
Add "Standings" link to the header nav.

### Step 6: Database Changes
- Add `sportmonks_id` column to `teams` table (integer, nullable, unique) for ID mapping
- Optionally add `sportmonks_season_id` to a config or use dynamic lookup

## Technical Details

- **Base URL**: `https://api.sportmonks.com/v3/football`
- **Auth**: `?api_token={SPORTMONKS_API_KEY}` appended by edge function
- **CORS**: SportMonks requires server-side proxy (no browser CORS support) — hence the edge function
- **Includes**: Use `&include=participant;details` on standings to get team names + W/D/L/GF/GA in one request
- **Rate limits**: Depends on plan tier; edge function will respect these
- **ID mapping**: SportMonks uses its own `participant_id` for teams. Map by team name during first fetch, store as `sportmonks_id`

