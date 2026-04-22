

# Dashboard: paginate upcoming + immediate recent results

## Change 1 — Upcoming matches: show 9 + "Load more"

In `src/pages/Index.tsx`:
- Add `const [upcomingLimit, setUpcomingLimit] = useState(9);`
- Render `upcoming.slice(0, upcomingLimit)` instead of all `upcoming`.
- Below the grid, when `upcomingLimit < upcoming.length`, render a centered "Load more" button that does `setUpcomingLimit((n) => n + 9)`.
- Reset limit to 9 whenever the league filter changes (via `useEffect` on `league`).
- Translation keys: add `dashboard.load_more` to `src/i18n/en.json` and `src/i18n/de.json`.

## Change 2 — Recent Results show completed matches immediately

**Root cause:** `useCompletedMatches` only queries `status = 'completed'`. A match that has just finished sits in `live`/`2H`/`ET` status until the next `auto-sync` run flips it to `completed` — which can lag 2–3 hours depending on cron cadence and API-Football's status update.

**Fix in `src/hooks/useMatches.ts` (`useCompletedMatches`):**
1. Broaden the query to include matches with a real final score regardless of status:
   - `status IN ('completed','FT','AET','PEN')` **OR** (`goals_home IS NOT NULL AND goals_away IS NOT NULL AND match_date < now() - interval '2 hours'`).
   - Use `.or(...)` to express this in a single Supabase query.
2. Keep the existing `Niedersachsen` exclusion and `match_date DESC` ordering, limit 12.
3. Keep refetch interval at 5 min — but also bump it to 60 s when the dashboard's `live` array is non-empty so a freshly-finished match appears within a minute. Implemented by passing an `aggressive` boolean from `Index.tsx` into `useCompletedMatches`.

**Bonus safety:** in `Index.tsx`, when a match transitions out of live (already detected via `transitionIds`), also invalidate the `["matches","completed"]` query alongside `["matches"]` so the recent-results grid refreshes the moment a match ends.

## Files touched
- `src/pages/Index.tsx` — pagination state, Load more button, completed-query invalidation, pass `aggressive` flag.
- `src/hooks/useMatches.ts` — broaden completed query, accept `aggressive` arg for refetch interval.
- `src/i18n/en.json`, `src/i18n/de.json` — `dashboard.load_more` key.

## Out of scope
- No backend / sync cadence changes. The fix is purely a smarter client read so freshly-finished matches surface without waiting for the `status='completed'` flip.
- No change to live or trending sections.

