

# Remove "Sync Live Data" Button

The button is not necessary — the auto-sync system handles all data refreshing automatically (idle, pre-match, live, and full modes). Removing it simplifies the UI and prevents unnecessary manual API calls.

## Changes

### `src/pages/Index.tsx`
- Remove the `useSyncFootballData` import and hook
- Remove the `useSyncSportradarData` import and hook (if still referenced)
- Remove the `runSync`, `handleSync` functions
- Remove the `SYNC_COOLDOWN_MS` and `SYNC_KEY` constants
- Remove the auto-sync `useEffect` that triggers on page load
- Remove the `<Button>` with the RefreshCw icon from the hero section
- Remove unused imports: `RefreshCw`, `Button`, `toast`, `useSyncFootballData`, `useSyncSportradarData`

The hero section becomes just the title and subtitle, left-aligned, without the sync button on the right.

