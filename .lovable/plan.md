

# Plan: Restore live data on the match details page

## Root cause

Two compounding issues, confirmed in network logs and DB:

1. **API-Football daily quota is exhausted.** Every `/fixtures`, `/fixtures/events`, and `/fixtures/lineups` call comes back with `errors.requests: "You have reached the request limit for the day"` and `response: []`. The `LiveMatchCard` then sees no fixture and no events and renders nothing. The header score also stays at the DB value because `liveFixture` is empty.
2. **`matches.status` is stale in the DB.** 23 of 24 matches currently in the live window still have `status='upcoming'`. The UI's "is this live?" decision relies on either the DB status being `live`/`1H`/`2H`/`HT`, or `deriveMatchPhase` returning `transition_live` — which is only valid for the first 3 hours after kickoff. After that window, matches that should be live (or just-finished) silently fall back to "upcoming" UI.
3. **The client keeps polling every 5 seconds against a quota-exhausted endpoint**, which burns into tomorrow's quota and guarantees the problem repeats.

So even on the days quota *is* available, the live UI is fragile because it depends on stale DB status + no graceful handling of empty live responses.

## Fix

Three targeted changes. None of them require API-Football quota to start working.

### 1. Make `useLiveFixture` / `useFixtureEvents` quota-aware (stop the bleeding)

In `src/hooks/useFixtureData.ts`, when the proxy response contains `errors.requests` (quota), stop polling for the rest of the session and surface a flag so the UI can show "Live data unavailable (provider quota reached)" instead of an empty card. Concretely:

- Detect `data?.errors?.requests` in the queryFn, throw a typed `QuotaExhaustedError`.
- Set `refetchInterval: false` whenever the last error is quota-related (already partially in place via the `query.state.error` guard, but it currently keeps polling on empty `response: []`).
- Treat empty `response: []` after a 200 as a non-error but still skip re-poll within 60s.

### 2. Auto-flip stale match status from the client (graceful fallback)

The real fix for stale status is the `auto-sync` cron, but as a safety net the match details page should derive a working "live" state without relying on DB status:

- Extend `deriveMatchPhase` so `transition_live` extends to the entire post-kickoff window where the match could plausibly still be running (e.g. up to 2.5h after kickoff for "live", and "completed_pending" between 2.5h–4h to differentiate). This keeps the LIVE badge and live polling enabled past the current 3h cutoff only when DB `status='upcoming'` (clear sign sync is behind).
- When `liveFixture` returns a non-null payload with `status.short` in `LIVE/1H/2H/HT/ET`, trust it over DB status everywhere on the page. Currently the score swap is gated by `isMatchLive` (DB-derived); flip it to "live fixture present" so a live API response is always shown.

### 3. Render a useful state in `LiveMatchCard` when there is no fixture

Right now `LiveMatchCard` returns `null` when there is no fixture and no events. Replace that with:

- If quota error → "Live updates paused — provider quota reached, retrying tomorrow".
- If DB `status` says live but API returned empty → "Waiting for live data from provider…" with a manual refresh button.
- If `transition_live` and no API data → "Match has kicked off — waiting for first update".

This way the user always sees *why* there is no live data instead of a blank.

### 4. Fix the underlying `auto-sync` lag (the real cure)

Ops-side: the fact that 23/24 in-window matches are still `upcoming` in the DB means `auto-sync` either isn't running often enough, also hit the daily quota, or is filtering them out. Check the `auto-sync` cron logs, confirm it pulls live fixtures on a 60s cadence inside match windows, and apply the same quota-detection so it backs off cleanly instead of writing nothing.

## Files to touch

| File | Change |
|---|---|
| `src/hooks/useFixtureData.ts` | Detect `errors.requests`, expose `quotaExhausted`, stop polling on quota / empty |
| `src/lib/match-status.ts` | Extend `transition_live` window with a separate "completed_pending" phase; small helper `isLiveLike` |
| `src/components/LiveMatchCard.tsx` | Render explicit empty/quota states instead of returning null; trust live fixture status when present |
| `src/pages/MatchDetail.tsx` | Use `liveFixture` presence as the source of truth for "show live score", not DB status alone |
| `supabase/functions/auto-sync/index.ts` | Quota-aware backoff + verify live-fixture write path covers `1H/2H/HT` correctly |

## Verification

After deploy:
- Open a live match details page → either real live score+events, or a clear "live data paused: quota reached" message — never a silent blank.
- Once the daily API quota resets, live score and events appear within 5 seconds of the next poll.
- A spot check `select count(*) from matches where status='upcoming' and match_date < now() - interval '15 min' and match_date > now() - interval '2 hours'` should drop to ~0 within one `auto-sync` tick.

