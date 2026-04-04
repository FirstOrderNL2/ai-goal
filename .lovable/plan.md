

# Fix Live Match Sync and Data Issues

## Problems Found

1. **Scores not updating for live matches**: The `sync-football-data` function returns `matches: 0` — it syncs but the upsert doesn't update existing rows because the sync fetches fixtures by date range and the upsert may not be picking up in-progress changes. The API call returns data, but with `"apiCalls": 40` and `"matches": 0`, it appears the fixture data isn't changing or the upsert is a no-op.

2. **Duplicate matches showing in Live section**: Sportradar-only duplicates appear alongside API-Football matches. Examples:
   - "Real Betis Seville vs Espanyol Barcelona" (Sportradar) duplicates "Real Betis vs Espanyol" (API-Football)
   - "Strasbourg Alsace vs OGC Nice" (Sportradar, still "live") duplicates "Strasbourg vs OGC Nice" (API-Football, already "completed")

3. **Completed matches stuck as "live"**: The Strasbourg vs Nice match (15:00 UTC, 4+ hours ago) is still showing as "live" for the Sportradar duplicate. Same pattern for Verona vs Fiorentina (16:00 UTC, 3.5h ago).

4. **Barcelona match has null scores**: The Atletico vs Barcelona match (19:00 UTC) shows `goals_home: null, goals_away: null` despite being live for 30 minutes.

5. **Auto-sync uses 2h buffer but sportradar uses 3h buffer**: Inconsistency in stale match cleanup timing between `auto-sync/index.ts` (2h) and `sync-sportradar-data/index.ts` (3h).

## Fix Plan

### 1. Fix `useLiveMatches` to filter duplicates properly
**File: `src/hooks/useMatches.ts`**

The live query already filters Sportradar duplicates for covered leagues (lines 75-78), but the Sportradar-only matches that are duplicates of API-Football matches slip through because both have entries. The issue is that Sportradar-only entries (no `api_football_id`) for covered leagues like La Liga and Ligue 1 should never show in the live section. The existing filter on line 76-78 should already handle this — but the Strasbourg Alsace match has `league: "Ligue 1"` which IS in `API_FOOTBALL_LEAGUES`, and `api_football_id` IS null, so it should be filtered out.

Wait — let me re-check. The filter says: keep if league is NOT in API_FOOTBALL_LEAGUES, OR api_football_id is not null. "Ligue 1" is in the list, and api_football_id is null for the Sportradar entry → it should be filtered out. So the client-side filter is working. The issue must be that these duplicates show up in the network response but get filtered client-side.

Actually, looking at the network response, 9 matches come back, including the Sportradar duplicates. The client filter should remove them. But the Strasbourg Alsace one still appears in the live count... Let me re-examine — the filter checks `API_FOOTBALL_LEAGUES.includes(m.league)`. The Sportradar entry has `league: "Ligue 1"` which is in the list, AND `api_football_id` is null → so `!true || false` = `false` → filtered OUT. Good, the client filter works.

So the real issues are:

### 2. Fix auto-sync stale buffer to 3h (consistency)
**File: `supabase/functions/auto-sync/index.ts`**
- Change the 2-hour buffer on line 59 to 3 hours to match the sportradar sync fix

### 3. Fix sync-football-data to actually update live scores
**File: `supabase/functions/sync-football-data/index.ts`**
The sync returns `matches: 0` which means it's not finding/updating fixtures. The function likely fetches fixtures by date range — need to ensure it includes today's live matches and that the upsert actually updates `goals_home`, `goals_away`, and `status` fields. Investigate the fixture fetch date range logic to ensure live matches are included.

### 4. Add a "sync live scores" dedicated path
**File: `supabase/functions/sync-football-data/index.ts`**
Add a specific API call to fetch live fixtures (`/fixtures?live=all` or `/fixtures?date=today`) that focuses on updating scores for in-progress matches, separate from the general fixture sync.

### 5. Clean up stale Sportradar-only duplicates
Run a database update to mark Sportradar-only entries for covered leagues that are past their expected end time as "completed", preventing them from lingering in the live section.

## Technical Details

### File changes:

**`supabase/functions/auto-sync/index.ts`** (line 59):
```typescript
// Change 2h to 3h buffer
const cutoff = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
```

**`supabase/functions/sync-football-data/index.ts`**:
- Add a live fixtures fetch at the start of each league sync: `/fixtures?league={id}&season={SEASON}&date={today}` to ensure today's matches (including live ones) get their scores updated
- The current date range logic may be missing today's fixtures if they fall outside the sync window

**Database cleanup** (one-time):
- Mark Sportradar-only duplicates for covered leagues as "completed" if they're past kickoff + 3 hours
- Update the Barcelona match scores from the API

## Impact
- 2 edge function changes
- 1 database correction
- Ensures live scores update properly during matches
- Prevents stale Sportradar duplicates from appearing in live section

