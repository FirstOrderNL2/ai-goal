

# Fix: Barcelona Match Not Showing in Live Section

## Problem
The Atletico Madrid vs FC Barcelona match (19:00 UTC today) has `status: "completed"` in the database even though it just kicked off. This prevents it from appearing in the Live Matches section.

**Root cause**: The Sportradar sync function has a catch-all query (line 507-511) that blindly marks ALL matches with `match_date < now()` and `status = "upcoming"` as `"completed"`. When the sync runs after kickoff but before the API returns live status data for that match, it incorrectly marks it as finished.

## Fix

### File: `supabase/functions/sync-sportradar-data/index.ts`
**Change the catch-all "fix stale upcoming" logic** to only mark matches as completed if they are significantly past their expected end time (e.g., 3+ hours after kickoff), not immediately after kickoff:

```
// Before (broken):
.update({ status: "completed" })
.eq("status", "upcoming")
.lt("match_date", new Date().toISOString());

// After (safe):
.update({ status: "completed" })
.eq("status", "upcoming")
.lt("match_date", new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString());
```

This gives a 3-hour buffer so matches that just kicked off stay as "upcoming" until the proper sync sets them to "live", rather than being incorrectly marked "completed".

### File: `supabase/functions/sync-football-data/index.ts`
Check if a similar catch-all exists and apply the same 3-hour buffer fix.

### Immediate data fix
Run an update to set the Atletico vs Barcelona match status back to "live" so it appears immediately, plus set `goals_home`/`goals_away` to null since the match just started.

## Impact
- One edge function change (1 line)
- One database correction
- Prevents future matches from being incorrectly marked as completed at kickoff

