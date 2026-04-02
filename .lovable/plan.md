

# Complete API-Football Data Pipeline

## Current State

The project already has a working foundation:
- **`sync-football-data`**: Syncs fixtures + teams for 9 leagues, fetches 5 predictions per league
- **`get-football-data`**: Proxy for on-demand API calls (H2H, lineups, standings, etc.)
- **`batch-generate-predictions`**: AI predictions with Poisson model, computing form/stats inline
- **`auto-sync`**: Orchestrator (does NOT currently call `sync-football-data`)
- **Standings page**: Uses Sportradar (not API-Football)

## What's Missing

| Feature | Status |
|---|---|
| `leagues` table | Not stored — league is just a text field |
| `team_statistics` table | Computed on-the-fly, not persisted |
| `match_features` table (AI-ready) | Not persisted |
| Standings from API-Football | Uses Sportradar instead |
| H2H caching | Fetched live, not stored |
| `sync-football-data` in auto-sync pipeline | Missing — only Sportradar + scrapers run |
| Rate limit tracking | None |
| Proper status mapping | Only checks "FT", misses "AET", "PEN", etc. |

## Plan

### 1. Database migration — 3 new tables

**`leagues`**: `id`, `api_football_id` (unique), `name`, `country`, `season`, `logo_url`, `standings_data` (jsonb — full standings array from API-Football), `updated_at`

**`team_statistics`**: `id`, `team_id` (FK teams), `league_id` (FK leagues), `season`, `matches_played`, `wins`, `draws`, `losses`, `goals_for`, `goals_against`, `goal_diff`, `form` (text, "WWDLW"), `home_record` (jsonb), `away_record` (jsonb), `clean_sheets`, `failed_to_score`, `avg_goals_scored`, `avg_goals_conceded`, `updated_at`. Unique on (`team_id`, `league_id`, `season`).

**`match_features`**: `id`, `match_id` (unique FK), `home_form_last5`, `away_form_last5`, `home_avg_scored`, `home_avg_conceded`, `away_avg_scored`, `away_avg_conceded`, `h2h_results` (jsonb), `league_position_home`, `league_position_away`, `position_diff`, `home_clean_sheet_pct`, `away_clean_sheet_pct`, `home_btts_pct`, `away_btts_pct`, `poisson_xg_home`, `poisson_xg_away`, `computed_at`.

All with public SELECT RLS.

### 2. Upgrade `sync-football-data` edge function

Major rewrite to add:
- **Standings sync**: `/standings?league={id}&season={SEASON}` → store in `leagues.standings_data` jsonb
- **Team statistics**: `/teams/statistics?team={id}&league={id}&season={SEASON}` → store in `team_statistics`
- **H2H caching**: For upcoming matches, fetch `/fixtures/headtohead?h2h={homeApiId}-{awayApiId}` → store in `match_features.h2h_results`
- **Better status mapping**: Handle "FT", "AET", "PEN" as completed; "1H", "2H", "HT", "ET" as live; "PST", "CANC", "ABD" accordingly
- **Rate limit tracking**: Track API calls per run, stop at 80% of daily limit (the free tier is 100/day, but user may have a paid plan — the key they shared suggests a paid plan). Add delay between calls.
- **Lineups**: For matches starting within 2 hours, fetch `/fixtures/lineups?fixture={id}` → store in `match_context`

### 3. New `compute-features` edge function

Reads from `matches` (completed), `team_statistics`, `leagues` (standings), and H2H data to compute and upsert into `match_features` for each upcoming match:
- Last 5 form per team (from completed matches)
- Avg goals scored/conceded (from `team_statistics`)
- League positions (from `leagues.standings_data`)
- Poisson xG anchors
- BTTS/clean sheet percentages

### 4. Update `auto-sync` pipeline

New order:
1. `sync-football-data` (primary — fixtures, teams, standings, team stats, H2H)
2. `sync-sportradar-data` (secondary — live scores, odds)
3. `scrape-matches` (supplementary)
4. `scrape-news`
5. Stale match cleanup
6. `compute-features`
7. `batch-generate-predictions`

### 5. Refactor `batch-generate-predictions`

Replace the inline form/stats computation (~100 lines) with a simple read from `match_features` table. The AI prompt gets pre-computed data instead of computing it per prediction.

### 6. Standings page: Switch to API-Football

Rewrite `Standings.tsx` to read from the `leagues` table (`standings_data` jsonb) instead of Sportradar. Remove Sportradar dependency for standings. Keep the same UI layout.

### 7. Frontend: Show features on match detail

Add a "Match Statistics" card on `MatchDetail.tsx` showing data from `match_features` — form comparison, H2H, league positions, Poisson xG.

### 8. Types + hooks

- Add `League`, `TeamStatistics`, `MatchFeatures` interfaces to `src/lib/types.ts`
- Add `useStandingsFromDB` hook, `useMatchFeatures` hook

## Files to Change

| File | Change |
|---|---|
| DB migration | Create `leagues`, `team_statistics`, `match_features` tables |
| `supabase/functions/sync-football-data/index.ts` | Full rewrite: add standings, team stats, H2H, lineups, rate limits, better status mapping |
| `supabase/functions/compute-features/index.ts` | **New** — compute AI-ready features per upcoming match |
| `supabase/functions/auto-sync/index.ts` | Add `sync-football-data` + `compute-features` to pipeline |
| `supabase/functions/batch-generate-predictions/index.ts` | Read from `match_features` instead of inline computation |
| `src/pages/Standings.tsx` | Read from `leagues` table instead of Sportradar |
| `src/pages/MatchDetail.tsx` | Add match features display card |
| `src/lib/types.ts` | Add new interfaces |
| `src/hooks/useMatches.ts` | Add `useMatchFeatures` hook |

## API Key Note

The API key you shared (`610cc87b...`) is already stored as `API_FOOTBALL_KEY` in the backend secrets. I will not put it in any code files — it stays server-side only.

## Priority Order

1. Database tables (migration)
2. `sync-football-data` upgrade
3. `compute-features` function
4. `auto-sync` update
5. `batch-generate-predictions` refactor
6. Standings page + match detail frontend

