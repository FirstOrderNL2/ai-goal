

# Fix Data Quality Issues: Duplicates, Stale Matches, Garbage Teams

## Problems Identified

### 1. Garbage Team Names (27 fake teams, 17 fake matches)
Sportradar API returns team name variants like "Vitesse outreach", "SC Cambuur Glasgow", "FC Dordrecht Cup", "Paris Saint-Germain F.C. Cup". These bypass the alias map and get created as new teams, generating duplicate matches.

### 2. Stale "Upcoming" Matches
Bayern Munich Women beat Man Utd 2-1 (your screenshot confirms), but the match still shows as "upcoming" because:
- These UWCL matches have no `sportradar_id` (scraped, not from Sportradar API)
- The auto-sync cleanup only runs every 4 hours and requires matches to be 3+ hours past kickoff
- The frontend filter `gte("match_date", now())` helps but doesn't catch same-day matches that have finished

### 3. Chelsea vs Arsenal Appearing Twice
This is actually **correct** — there are two separate matches: Apr 1 (completed, first leg) and Apr 2 (upcoming, second leg). Both are legitimate UWCL quarter-final legs. Same for Barcelona vs Real Madrid (Apr 2 + Apr 3) and Lyon vs Wolfsburg (Apr 2 + Apr 3).

---

## Fix Plan

### 1. Database Cleanup Migration
- Delete 17 matches linked to garbage teams
- Delete 27 garbage teams (names containing "outreach", "Cup", "Joint", "Copier", "Glasgow", "Sint-Petersburg")
- Mark any `upcoming` match where `match_date < now() - interval '2 hours'` as `completed`

### 2. Fix Sportradar Sync — Filter Garbage Names
**File: `supabase/functions/sync-sportradar-data/index.ts`**
- Add a blocklist filter in `findOrCreateTeam()` that rejects team names containing known garbage suffixes ("outreach", "Cup", "Joint", "Copier", etc.)
- Skip any match where either team name is rejected
- This prevents future garbage from entering the database

### 3. Improve Stale Match Cleanup
**File: `supabase/functions/auto-sync/index.ts`**
- Reduce the stale cutoff from 3 hours to 2 hours (matches are typically 90 min + halftime)
- Also run cleanup on frontend sync trigger

**File: `src/hooks/useMatches.ts`**
- Change the upcoming query filter from `gte("match_date", new Date().toISOString())` to subtract 2 hours from now, so matches that kicked off 2+ hours ago no longer appear as upcoming even before the backend cleanup runs

### 4. Add Round Info to MatchCard for Multi-Leg Clarity
**File: `src/components/MatchCard.tsx`**
- Show the `round` field (e.g. "Quarter-final Leg 2") when available, so users understand why Chelsea vs Arsenal appears twice

## Files to Change

| File | Change |
|---|---|
| DB migration | Delete garbage teams/matches, mark stale matches completed |
| `supabase/functions/sync-sportradar-data/index.ts` | Add garbage name filter |
| `supabase/functions/auto-sync/index.ts` | Reduce stale cutoff to 2 hours |
| `src/hooks/useMatches.ts` | Subtract 2h from upcoming filter |
| `src/components/MatchCard.tsx` | Show round info |

