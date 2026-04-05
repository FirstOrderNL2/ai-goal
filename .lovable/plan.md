

# Remove Sportradar & Fix Stale Matches — API-Football Only

## Problems Found

1. **Man City vs Liverpool** (finished 4-0) still shows as "upcoming" — it has NO `api_football_id` and NO `sportradar_id`, so no sync updates it
2. **328 upcoming matches** have no `api_football_id` — they were created by Sportradar or scraping, and never get score updates
3. **Duplicate matches** exist: e.g., Man City vs Arsenal on Apr 19 appears twice (one API-Football, one Sportradar-only)
4. **Sportradar sync still runs** in auto-sync, creating duplicates and inaccurate data

## Root Cause

Matches created by Sportradar (`sync-sportradar-data`) or scraping (`scrape-matches`) lack an `api_football_id`. The score update logic in `sync-football-data` only updates matches **that already have an `api_football_id`**, so these orphaned matches stay "upcoming" forever.

## Plan

### 1. Remove Sportradar from auto-sync
**File: `supabase/functions/auto-sync/index.ts`**
- Remove the `sync-sportradar-data` call entirely (lines 106-109)
- Keep everything else (API-Football sync, cleanup, predictions)

### 2. Delete Sportradar-only duplicate matches (database migration)
- Delete all matches where `api_football_id IS NULL` AND `sportradar_id IS NOT NULL` AND the same fixture exists with an `api_football_id` (same teams, same date)
- For non-duplicate Sportradar-only matches in covered leagues: delete them (API-Football is the source of truth)
- Keep Sportradar-only matches for leagues NOT covered by API-Football (if any)

SQL migration:
```sql
-- Remove all matches without api_football_id in API-Football covered leagues
DELETE FROM matches 
WHERE api_football_id IS NULL 
AND league IN ('Premier League', 'Championship', 'La Liga', 'Serie A', 
  'Bundesliga', 'Ligue 1', 'Eredivisie', 'Keuken Kampioen Divisie',
  'Champions League', 'Europa League', 'Conference League', 
  'Women''s Champions League', 'World Cup', 'WC Qualifiers Europe',
  'WC Qualifiers South America', 'WC Qualifiers CONCACAF',
  'Nations League', 'Euro Championship', 'Copa America', 'Friendlies');
```

Also clean up orphan matches with no source at all (like Man City vs Liverpool with both NULL):
```sql
DELETE FROM matches 
WHERE api_football_id IS NULL 
AND sportradar_id IS NULL 
AND status = 'upcoming';
```

### 3. Simplify useMatches.ts — remove Sportradar filtering
**File: `src/hooks/useMatches.ts`**
- Remove `API_FOOTBALL_LEAGUES` array and all filtering logic that checks for `api_football_id`
- Since all data now comes from API-Football, no duplicate filtering needed
- Simplify `useUpcomingMatches`, `useLiveMatches`, `useCompletedMatches` to straightforward queries

### 4. Stop scrape-matches from creating new match entries
**File: `supabase/functions/auto-sync/index.ts`**
- Remove `scrape-matches` call (it creates matches without `api_football_id` that never get updated)
- Keep `scrape-news` if desired for news/context

## Expected Result
- All matches come from API-Football with proper `api_football_id`
- Scores always update correctly via live/today sync
- No more duplicates or stale "upcoming" matches
- Simpler, more reliable data pipeline

