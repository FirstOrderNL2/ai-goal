

# Integrate Sportradar Soccer API

## Analysis

From your screenshot, you have a Sportradar trial (Mar 30 – Apr 29, 2026) with:
- **Soccer Base** — competitions, schedules, standings, probabilities, H2H, lineups, fun facts
- **Soccer Extended Base** — 100+ extended stats, xG-level data, AI match insights, momentum

**Base URL:** `https://api.sportradar.com/soccer/trial/v4/en/` (Base) and `https://api.sportradar.com/soccer-extended/trial/v4/en/` (Extended)
**Auth:** API key passed as query param `?api_key={key}`

**Key Sportradar competition IDs** (format `sr:competition:ID`):
- Premier League: `sr:competition:17`
- La Liga: `sr:competition:8`
- Serie A: `sr:competition:23`

## What Sportradar Adds Over API-Football

| Feature | API-Football (existing) | Sportradar (new) |
|---------|------------------------|------------------|
| Win probabilities | Via `/predictions` | Season Probabilities feed — all matches at once |
| Standings | Available | Available |
| H2H | Available | Competitor vs Competitor feed |
| Extended stats | Limited | 100+ data points (passes, tackles, dribbles, xG) |
| Match insights | None | AI-generated previews and summaries |
| Fun facts | None | Sport Event Fun Facts |
| Over/Under stats | Manual calc | Season Over/Under Statistics feed |
| Lineups/formations | Available | Available with formations |

## Plan

### Step 1: Store API Key
Store `SPORTRADAR_API_KEY` as a backend secret (value from your screenshot: `BHd8....4Xvm` — you'll paste the full key).

### Step 2: Create Edge Function — `get-sportradar-data`
A proxy edge function similar to `get-football-data`, but for Sportradar endpoints.

**Whitelisted endpoints:**
- `/competitions.json` — list competitions
- `/seasons/{id}/schedules.json` — season schedule
- `/seasons/{id}/probabilities.json` — win probabilities for all matches
- `/seasons/{id}/standings.json` — standings
- `/seasons/{id}/over_under_statistics.json` — O/U stats
- `/sport_events/{id}/summary.json` — match summary with stats
- `/sport_events/{id}/fun_facts.json` — fun facts
- `/sport_events/{id}/lineups.json` — lineups
- `/competitors/{id}/versus/{id}/summaries.json` — H2H
- `/competitors/{id}/profile.json` — team profile

For Extended API (separate base URL):
- `/sport_events/{id}/extended_summary.json` — extended stats
- `/sport_events/{id}/insights.json` — AI match insights

### Step 3: Create Sync Edge Function — `sync-sportradar-data`
Fetches season probabilities and standings from Sportradar and upserts into the existing `predictions` and `matches` tables. This complements the API-Football sync by adding Sportradar's probability data alongside the existing predictions.

- Fetch `/seasons/{id}/probabilities.json` for each league
- Map Sportradar team/match IDs to our DB (store `sportradar_id` on teams/matches)
- Upsert probabilities into `predictions` table (or a new `sportradar_predictions` column set)

### Step 4: Database Migration
- Add `sportradar_id` column to `teams` table (text, unique, nullable)
- Add `sportradar_id` column to `matches` table (text, unique, nullable)
- Optionally add `fun_facts` (text[]) and `ai_insights` (text) columns to `matches`

### Step 5: Update Frontend
- Add Sportradar data sections to **MatchDetail** page:
  - **Fun Facts** card — fetched on-demand via proxy
  - **AI Insights** card — pre-match preview from Extended API
  - **Extended Stats** — passes, tackles, dribbles for completed matches
  - **Lineups** with formations
- Add **Standings** page/section using Sportradar standings feed
- Show Sportradar probabilities alongside API-Football predictions for comparison

### Step 6: Create Frontend Hooks
- `useSportradarData(endpoint, params)` — generic proxy hook
- `useFunFacts(sportradarEventId)` — fun facts for a match
- `useMatchInsights(sportradarEventId)` — AI insights
- `useStandings(seasonId)` — league standings

## Technical Details

**API URL patterns:**
```text
Base:     https://api.sportradar.com/soccer/trial/v4/en/{path}?api_key={key}
Extended: https://api.sportradar.com/soccer-extended/trial/v4/en/{path}?api_key={key}
```

**Rate limits:** Trial tier — typically 1 request/second, 1000 requests/day. The proxy function will need to respect this.

**ID mapping challenge:** Sportradar uses `sr:competitor:X` and `sr:sport_event:X` format IDs, while API-Football uses numeric IDs. Team mapping will be done by name matching during the first sync, then stored as `sportradar_id` for future lookups.

