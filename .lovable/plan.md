

# Remove All Mock/Demo Data

## Problem
The database contains manually seeded demo data with distinctive IDs (e.g., `11000000-...`, `a1000000-...`, `b1000000-...`, `c1000000-...`). This includes ~30 fake teams, ~35 fake matches, fake predictions, and fake odds. The frontend queries Supabase directly, so removing the DB rows is all that's needed.

## Solution
Run a single database migration that truncates all four tables in the correct order (respecting foreign keys):

```sql
TRUNCATE public.odds, public.predictions, public.matches, public.teams CASCADE;
```

This removes all demo data. After this, the app will show empty states ("No upcoming matches found", "No recent matches") until real data is synced via the "Sync Live Data" button.

## What Happens After
- Dashboard shows empty states until user clicks "Sync Live Data"
- Standings page continues to work (fetches live from Sportradar API)
- Teams page will be empty until a sync populates real teams
- No code changes needed — the frontend already handles empty states gracefully

## Files Changed
| File | Change |
|---|---|
| New migration SQL | `TRUNCATE public.odds, public.predictions, public.matches, public.teams CASCADE;` |

One migration, no code changes.

