

# Expand API-Football as Complete Data Source

## Current State

- **9 leagues synced**: PL, La Liga, Serie A, Bundesliga, Ligue 1, World Cup, WCQ Europe, WCQ South America, Friendlies
- **Missing from sync**: UCL, UEL, UWCL, Eredivisie, KKD, Nations League, WCQ CONCACAF, Copa America, etc.
- **Massive duplicates**: 853 upcoming matches, ~half are Sportradar duplicates (e.g., La Liga has 180 upcoming but only 90 from API-Football)
- **No players table**: No player data stored at all
- **LeagueFilter has options** (UCL, UEL, UWCL, Eredivisie) that return zero API-Football results

## Plan

### 1. Database migration — Add `players` table + `type` column to leagues

**`players`** table: `id`, `api_football_id` (unique), `team_id` (FK teams), `name`, `position`, `age`, `nationality`, `photo_url`, `created_at`, `updated_at`. Public SELECT RLS.

Add `type` column (text, nullable) to `leagues` table for "league" vs "cup".

### 2. Expand LEAGUES config in `sync-football-data`

Add all competitions the user wants:

| Competition | API ID | Name |
|---|---|---|
| Champions League | 2 | UCL |
| Europa League | 3 | UEL |
| UWCL | 748 | Women's Champions League |
| Eredivisie | 88 | Eredivisie |
| KKD | 89 | Keuken Kampioen Divisie |
| Nations League | 5 | Nations League |
| WCQ CONCACAF | 33 | WCQ CONCACAF |
| Copa America | 9 | Copa America |
| Euro Championship | 4 | Euro |

Keep existing: PL (39), La Liga (140), Serie A (135), Bundesliga (78), Ligue 1 (61), World Cup (1), WCQ Europe (32), WCQ South America (34), Friendlies (10).

Total: ~18 leagues. Increase rate limit to 400 calls per run.

### 3. Add player sync to `sync-football-data`

For each league, fetch top squad players:
- `/players?league={id}&season={SEASON}&page=1` — fetch first page (20 players)
- Upsert into `players` table
- Link to team via `team_id`

### 4. Update dedup filter in `useMatches.ts`

Expand `API_FOOTBALL_LEAGUES` to include all newly synced leagues:
```
["Premier League", "La Liga", "Serie A", "Bundesliga", "Ligue 1",
 "UCL", "UEL", "Women's Champions League", "Eredivisie", 
 "Keuken Kampioen Divisie", "Nations League", "World Cup",
 "WC Qualifiers Europe", "WC Qualifiers South America", "WC Qualifiers CONCACAF"]
```

This ensures Sportradar/scraper duplicates are filtered out for all API-Football covered leagues.

### 5. Database cleanup — Delete Sportradar-only duplicates

SQL migration to delete upcoming matches without `api_football_id` for leagues now covered by API-Football. This removes ~400 duplicate rows.

### 6. Align LeagueFilter names with API-Football league names

Ensure the filter values match exactly what `sync-football-data` stores as `league` in the matches table. Map API-Football names:
- "UEFA Champions League" → "UCL" (store as "UCL")
- "UEFA Europa League" → "UEL"
- etc.

### 7. Add `players` hook and types

- Add `Player` interface to `src/lib/types.ts`
- Add `usePlayers(teamId)` hook

## Files to Change

| File | Change |
|---|---|
| DB migration | Create `players` table; add `type` to `leagues` |
| `supabase/functions/sync-football-data/index.ts` | Add ~9 new leagues, player sync, league type, raise rate limit |
| `src/hooks/useMatches.ts` | Expand `API_FOOTBALL_LEAGUES` dedup list |
| `src/components/LeagueFilter.tsx` | Ensure filter values match stored league names |
| `src/lib/types.ts` | Add `Player` interface |
| `src/hooks/useMatches.ts` | Add `usePlayers` hook |
| DB cleanup | Delete Sportradar duplicates for covered leagues |

## Priority

1. Expand leagues + dedup (immediate impact on dashboard accuracy)
2. Database cleanup
3. Players table + sync
4. LeagueFilter alignment

