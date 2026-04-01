

# Include Women's Champions League in Scraper

## Problem
The scraper at `supabase/functions/scrape-matches/index.ts` lines 268-273 has a blanket `continue` that skips ALL women's matches. The screenshot shows Women's Champions League matches on vi.nl that should be synced.

## Fix

**File: `supabase/functions/scrape-matches/index.ts`**

Change the women's match handling (lines 267-273): instead of skipping women's matches entirely, allow them through but label them correctly using the existing `mapCompetition` function which already handles this (`"Women's Champions League"`).

The `resolveTeamName` function already strips "Vrouwen" from team names (line 52), so team matching will work. The only change needed is removing the `continue` and passing the `womens` flag to `mapCompetition`.

**File: `src/components/LeagueFilter.tsx`**

Add a "UWCL" (Women's Champions League) filter button so users can filter for these matches.

## Changes Summary

| File | Change |
|---|---|
| `supabase/functions/scrape-matches/index.ts` | Remove the women's match skip logic; pass `womens` flag to `mapCompetition` instead |
| `src/components/LeagueFilter.tsx` | Add Women's Champions League filter button |

