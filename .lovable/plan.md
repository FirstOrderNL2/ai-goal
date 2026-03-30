

# Integrate API-Football Real Data

## Overview
Replace the current mock/seed data with real data from API-Football v3. Create an edge function that proxies requests to API-Football (since CORS prevents direct browser calls), fetches real fixtures, teams, predictions, and odds, then syncs them into the existing database tables.

## Step 1: Store API Key as Secret
Use the `add_secret` tool to securely store `API_FOOTBALL_KEY` with value `610cc87b22122f5698d9e8db617ae4d4`.

## Step 2: Edge Function — `sync-football-data`
Create `supabase/functions/sync-football-data/index.ts` that:

1. **Fetches fixtures** from `/fixtures?league={id}&season=2025&next=15` for leagues 39, 140, 135 (upcoming) and `/fixtures?league={id}&season=2025&last=20` (completed)
2. **Fetches teams** from the fixture responses (team data is embedded in fixture responses)
3. **Fetches predictions** from `/predictions?fixture={id}` for each upcoming fixture — this endpoint returns real win/draw/loss percentages and goal predictions
4. **Fetches odds** from `/odds?fixture={id}` for each upcoming fixture
5. **Upserts** all data into existing `teams`, `matches`, `predictions`, `odds` tables
6. Returns a summary of what was synced

API-Football auth: `x-apisports-key: {API_KEY}` header on all GET requests.

## Step 3: Edge Function — `get-football-data`
Create a lightweight proxy edge function for on-demand frontend queries (e.g., head-to-head, match statistics) that the frontend can call when viewing match details.

## Step 4: Update Frontend
- Add a "Sync Data" button (or auto-sync on page load with cache) that calls the sync edge function
- Update `useMatches` hooks to trigger a sync if data is stale
- Update MatchDetail page to fetch real H2H data and match statistics via the proxy function
- Use real team logos from `https://media.api-sports.io/football/teams/{api_team_id}.png` — store the API team ID in the teams table

## Step 5: Database Migration
Add columns to support real API data:
- `teams`: add `api_football_id` (integer), update `logo_url` with real URLs
- `matches`: add `api_football_id` (integer), `round` (text)
- Map API league names to our league values

## Technical Details

**API Response Mapping:**
- Fixture → `matches` table (date, home/away team refs, goals, status)
- Predictions endpoint → `predictions` table (home_win, draw, away_win, expected goals from `goals.home`/`goals.away`)  
- Odds endpoint → `odds` table (home_win_odds, draw_odds, away_win_odds from first bookmaker)
- Team from fixture → `teams` table (name, logo, country, league)

**Rate Limits:** Free plan = 100 requests/day. The sync function should batch intelligently — fetch fixtures first (3 calls for 3 leagues), then predictions per upcoming fixture. ~20 upcoming fixtures = ~23 total calls per sync.

**CORS:** Edge functions handle CORS. Frontend calls edge function, not API-Football directly.

