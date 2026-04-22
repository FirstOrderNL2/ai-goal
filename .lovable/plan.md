

# Remove "Niedersachsen" league from filter

The league filter in `src/components/LeagueFilter.tsx` shows a hardcoded list of leagues. "Niedersachsen" is not currently in that list, so it must be appearing dynamically from another source — likely a different filter component or it's coming from the matches data itself.

## Investigation needed (will do in default mode)

Search the codebase for "Niedersachsen" to find where it's rendered, then either:
1. Remove it from a hardcoded league list, OR
2. Add it to a filter exclusion list if it comes from match data dynamically.

## Files likely touched
- `src/components/LeagueFilter.tsx` (if hardcoded)
- or the dashboard/match query that populates league chips (if dynamic)

## Out of scope
- No backend / data sync changes — just hides the league from the UI filter.

