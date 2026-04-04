

# Analysis: Matches Still Not Loading

## Current Situation

The network logs confirm that **every single request to Supabase is still failing with "Failed to fetch"**. Despite the error-guarded polling code being correctly in place, requests continue firing every ~4 seconds with 3 parallel queries each time.

## Root Cause Analysis

The error guards (`refetchInterval: (query) => query.state.error ? false : interval`) are correctly implemented. The persistent failures point to two compounding issues:

1. **Auto-sync on mount**: The `useEffect` in `Index.tsx` triggers `runSync()` on page load, which calls two edge functions simultaneously. These are heavy requests that may be saturating the connection pool or triggering rate limits on the Supabase endpoint.

2. **Query re-mounting**: When all 3 homepage queries fail, React may re-render the component, which can reset query state and restart the cycle. The `enrichMatches` function compounds this — even if the initial query succeeds, it fires 3 more sub-queries (teams, predictions, odds), creating a burst of 12 total requests.

3. **No staleTime**: Without `staleTime`, React Query considers data stale immediately and refetches on every re-render/re-mount, even if the error guard paused polling.

## Plan

### 1. Add `staleTime` to all homepage queries
**File: `src/hooks/useMatches.ts`**
- Add `staleTime: 30_000` (30s) to `useUpcomingMatches`, `useLiveMatches`, `useCompletedMatches`
- This prevents re-mounts from triggering immediate refetches

### 2. Delay auto-sync and make it non-blocking
**File: `src/pages/Index.tsx`**
- Increase the auto-sync delay from 1 second to 10 seconds, giving the main queries time to complete first
- Wrap `runSync()` in a check that only runs if the main queries have succeeded (i.e., don't sync if we can't even reach the database)

### 3. Serialize enrichment queries
**File: `src/hooks/useMatches.ts`**
- In `enrichMatches`, keep the `Promise.all` but add a small guard: if `matches` is empty, skip enrichment entirely (already done, but verify)
- This reduces the request burst from 12 to 3 when there's no data

### 4. Add `networkMode: 'online'` to prevent offline retries
**File: `src/App.tsx`**
- Add `networkMode: 'online'` to the global query defaults so React Query won't attempt queries when the browser detects it's offline or connections are failing

## Technical Details

The key fix is `staleTime`. Without it, React Query treats cached data as immediately stale, so any component re-render triggers a refetch — even if the error guard stopped the polling interval. Adding 30s of staleTime means the query won't refetch on re-mount if it recently attempted (success or failure).

