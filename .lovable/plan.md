

# StatsBomb Open Data Integration + Fix Runtime Error

## Analysis: StatsBomb Open Data

StatsBomb provides **free, high-quality football event data** as static JSON files hosted on GitHub. No API key needed — data is fetched directly from raw GitHub URLs.

**Data structure:**
- `competitions.json` — list of all available competitions/seasons
- `data/matches/{competition_id}/{season_id}.json` — match listings per season
- `data/events/{match_id}.json` — detailed event-level data (passes, shots, tackles, etc.)
- `data/lineups/{match_id}.json` — lineup data per match
- `data/three-sixty/{match_id}.json` — StatsBomb 360 freeze-frame data

**Available competitions include:** Premier League, La Liga, Bundesliga, Champions League, World Cup, Women's Super League, and more. Covers select seasons with granular event data (every pass, shot, dribble, tackle with x/y coordinates).

**Key value for your project:** StatsBomb provides deep event-level data (shot maps, pass networks, xG per shot) that neither API-Football nor Sportradar offer for free. This is historical data only (no live/upcoming matches), but it's excellent for enriching match analysis and building visualizations.

## Plan

### Step 1: Fix Runtime Error (hooks violation)
The `MatchDetail.tsx` component calls `useHeadToHead` after early returns on lines 18 and 30. Move all hooks to the top of the component, before any conditional returns.

### Step 2: Create StatsBomb Data Fetching Utility
Create `src/lib/statsbomb.ts` with functions to fetch from raw GitHub URLs:
- `fetchCompetitions()` — get all available competitions
- `fetchMatches(competitionId, seasonId)` — get matches for a season
- `fetchEvents(matchId)` — get event data for a match
- `fetchLineups(matchId)` — get lineups for a match

Base URL: `https://raw.githubusercontent.com/statsbomb/open-data/master/data/`

No edge function needed — these are public static files, fetchable directly from the browser.

### Step 3: Create Frontend Hooks
- `useStatsBombCompetitions()` — list available competitions
- `useStatsBombMatches(competitionId, seasonId)` — matches in a season
- `useStatsBombEvents(matchId)` — event data for a match

### Step 4: Add StatsBomb Data Section to MatchDetail
For matches that can be linked to StatsBomb data (by team name matching), show:
- **Shot map** — all shots with xG values plotted on a pitch
- **Key events** timeline — goals, cards, substitutions
- **Pass statistics** — completion rates, key passes

### Step 5: Add StatsBomb Explorer Page (optional)
A new `/statsbomb` route letting users browse StatsBomb's free competitions, view historical matches, and explore event data — useful for research and analysis beyond the prediction dashboard.

## Technical Details

**No API key required.** Data is fetched via plain HTTP GET from GitHub raw URLs:
```text
https://raw.githubusercontent.com/statsbomb/open-data/master/data/competitions.json
https://raw.githubusercontent.com/statsbomb/open-data/master/data/matches/{comp_id}/{season_id}.json
https://raw.githubusercontent.com/statsbomb/open-data/master/data/events/{match_id}.json
https://raw.githubusercontent.com/statsbomb/open-data/master/data/lineups/{match_id}.json
```

**Matching to existing data:** StatsBomb uses its own match/team IDs. Linking to your existing matches will be done by team name + date matching. Not all matches will have StatsBomb data — only those in covered competitions/seasons.

**License:** Free for non-commercial use. Must credit "StatsBomb" and use their logo when publishing analysis based on this data.

