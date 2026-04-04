

# Fix: Matches Not Loading Due to Request Storm

## Root Cause

The database has plenty of data (945 upcoming, 8 live, 6264 completed matches). The problem is **every network request is failing with "Failed to fetch"** — a connectivity-level failure, not a server error.

This is caused by a **retry storm**: when initial requests fail (e.g., due to a brief connectivity blip), React Query's default retry behavior (3 retries) multiplies the request count exponentially. Combined with aggressive polling intervals (5s, 10s, 30s) and the `enrichMatches` function adding 3 more parallel sub-queries per batch, the browser's connection pool gets saturated and all requests fail indefinitely.

## Plan

### 1. Add React Query global defaults to limit retries
**File: `src/App.tsx` (or wherever QueryClient is configured)**
- Set `retry: 1` (instead of default 3) globally
- Set `retryDelay: 3000` to space out retries
- Add `refetchOnWindowFocus: false` to prevent burst refetches when tabbing back

### 2. Guard polling intervals to pause on error
**File: `src/hooks/useMatches.ts`**
- For `useLiveMatches` and `useUpcomingMatches`, only enable `refetchInterval` when the query is NOT in an error state (React Query supports `refetchInterval: (query) => query.state.error ? false : interval`)
- This prevents failed polls from stacking up endlessly

### 3. Guard fixture polling similarly
**File: `src/hooks/useFixtureData.ts`**
- Same pattern: disable `refetchInterval` when in error state for `useLiveFixture` and `useFixtureEvents`

### 4. Increase homepage polling intervals slightly
**File: `src/hooks/useMatches.ts`**
- `useLiveMatches`: keep at 30s (homepage level is fine)
- `useUpcomingMatches` / `useCompletedMatches`: keep at 5 min
- These are already reasonable; the main fix is stopping retry storms

## Technical Details

The key insight is that "Failed to fetch" means the browser itself is rejecting/dropping requests (connection pool exhaustion or CORS preflight failures under load), not that the server is returning errors. Once the storm starts, it's self-reinforcing because every poll interval triggers new requests that also fail and trigger retries.

The fix is defensive: limit retries, pause polling on errors, and let the system recover naturally.

