

The user wants 2. Bundesliga added to the league filter on the dashboard.

Looking at `src/components/LeagueFilter.tsx`, leagues are hardcoded. I need to add 2. Bundesliga and verify the API-Football naming convention matches what's stored in the `matches.league` column.

API-Football's standard name for the German second tier is **"2. Bundesliga"** (league ID 79). The filter does an exact `eq` match against `matches.league`, so the value must match what sync stores.

## Plan

### Change
Add one entry to the leagues array in `src/components/LeagueFilter.tsx`, placed right after Bundesliga:

```ts
{ value: "2. Bundesliga", label: "2. Bundesliga" },
```

### Verification needed after deploy
- Confirm `sync-football-data` / `auto-sync` is configured to pull league ID 79 (2. Bundesliga). If matches don't appear after adding the filter, the sync allow-list also needs 2. Bundesliga added — that lives in the edge function configuration.

### Files modified
- `src/components/LeagueFilter.tsx` — add 2. Bundesliga entry

No DB or edge function changes required for the UI filter itself. If matches don't show up after this change, a follow-up will be needed to add league 79 to the sync configuration.

