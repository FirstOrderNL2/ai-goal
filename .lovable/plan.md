
# Fix kickoff-transition bugs across dashboard and match pages

## What I found
- The backend already has a stale-upcoming safeguard in `auto-sync`, but the UI still has its own kickoff bug.
- `useUpcomingMatches()` deliberately includes fixtures from the last 2 hours, so a match can stay in the Upcoming section even after kickoff.
- `useLiveMatches()` only shows rows already marked `status = 'live'`, so there is a gap until the backend sync catches up.
- After removing the manual sync button, there is no client-side recovery path when kickoff happens before the next background update.
- The same blind spot exists on the match detail page: live polling only starts after the DB row is already marked live.
- The DB currently confirms this exact issue: `FC Volendam vs Feyenoord` and `Heerenveen vs Heracles` both have kickoff in the past but still `status = 'upcoming'`.

## Plan
### 1. Centralize match phase logic
Create one shared helper for display state, based on:
- normalized DB status
- kickoff time
- a short “transition live” window for matches that should have started already

This helper will classify matches as:
- `upcoming`
- `transition_live`
- `live`
- `completed`
- `cancelled`

### 2. Fix dashboard section partitioning
Update the dashboard data flow so:
- Upcoming only contains fixtures that are still in the future
- Live includes both true `live` rows and `transition_live` rows
- the same match cannot appear in both sections

I’d likely replace the current split logic with one shared dashboard match pipeline, or at minimum de-dupe and classify both hooks with the same helper.

### 3. Add silent auto-heal syncing
When the dashboard detects any `transition_live` match:
- quietly call the existing `auto-sync` orchestrator
- throttle it with a cooldown
- invalidate match queries on success

This keeps the UI automatic without bringing back a visible sync button.

### 4. Fix the match detail page flow too
Update detail-page logic so a just-started match behaves like live even before the DB status flips:
- `useMatch()` should poll during the kickoff-transition window
- `useLiveFixture()` / `useFixtureEvents()` should activate for `transition_live` matches too
- the header/live widgets should use the shared derived phase instead of only raw DB status

### 5. Standardize status handling across components
Clean up inconsistent UI checks like:
- `FT`
- `1H`
- `2H`
- `HT`
- `ET`

The DB mostly stores normalized statuses (`upcoming/live/completed/cancelled`), so list rendering should use normalized/derived status only. Raw API short codes should stay limited to live-detail display.

### 6. Clarify the freshness label
The card text currently says `Updated 49m ago`, but that is prediction freshness, not match-status freshness. I’d relabel it to `Prediction updated ...` so it doesn’t mislead users during live transitions.

## Files to update
- `src/hooks/useMatches.ts`
- `src/pages/Index.tsx`
- `src/hooks/useFixtureData.ts`
- `src/pages/MatchDetail.tsx`
- `src/components/MatchCard.tsx`
- likely a new shared helper, e.g. `src/lib/match-status.ts`
- possibly `src/hooks/useSync.ts` for the silent auto-heal hook

## Backend/database impact
- No schema change is required for the core fix.
- I would keep the existing backend stale-upcoming logic and make the frontend actively cooperate with it instead of waiting passively.

## Expected result
- A match like FC Volendam moves out of Upcoming as soon as kickoff passes.
- It shows in Live immediately during the transition window, then becomes fully synced/live after the silent refresh.
- No duplicate cards across Upcoming and Live.
- Match detail pages also switch into live behavior at kickoff instead of waiting for the DB status to change.
