

# Add Bundesliga & Ligue 1 + Fix Incomplete Imports

## Problems

1. Only 3 leagues configured (PL, La Liga, Serie A) — Bundesliga and Ligue 1 are missing
2. The sync function times out before finishing all leagues because the Sportradar trial API requires 1.2s delays between calls, and processing 3 leagues with schedules + probabilities already causes shutdowns
3. Some matches from 2024 show as "upcoming" because the Sportradar status was missing during sync — the `mapStatus` function defaults to "upcoming"

## Solution

### 1. Add Bundesliga & Ligue 1 to all config files

Add two new leagues with their Sportradar competition and season IDs:
- **Bundesliga**: `sr:competition:35`, season `sr:season:118697`
- **Ligue 1**: `sr:competition:34`, season `sr:season:118693`

Files to update:
- `src/lib/seasons.ts` — add entries + team aliases for German/French clubs
- `supabase/functions/sync-sportradar-data/index.ts` — add to LEAGUE_SEASONS + team aliases
- `src/components/LeagueFilter.tsx` — add Bundesliga and Ligue 1 buttons

### 2. Fix sync timeout by supporting per-league sync

The edge function times out when processing 5 leagues sequentially (each needs 2 API calls with 1.2s delays). Fix by:
- Accept an optional `league` query parameter so the frontend can sync one league at a time
- If no parameter, sync all (for backward compatibility)
- Update the frontend auto-sync to call each league sequentially or accept the longer time

### 3. Fix stale "upcoming" matches

Add logic in the sync to check: if match date is in the past and status is still "upcoming", mark it as "completed" (Sportradar may have returned the status but the sync timed out before processing it). This catches matches that slipped through.

### 4. Add German & French team aliases

Add common aliases for Bundesliga and Ligue 1 teams:
- Bayern München / FC Bayern Munich → bayern munich
- Borussia Dortmund → dortmund
- Paris Saint-Germain → PSG
- Olympique de Marseille → marseille
- etc.

## Files Changed

| File | Change |
|---|---|
| `src/lib/seasons.ts` | Add bundesliga + ligue_1 entries, competition mappings, and team aliases |
| `supabase/functions/sync-sportradar-data/index.ts` | Add 2 leagues, add team aliases, add optional `league` param, fix stale upcoming matches |
| `src/components/LeagueFilter.tsx` | Add Bundesliga and Ligue 1 filter buttons |

No database changes needed.

