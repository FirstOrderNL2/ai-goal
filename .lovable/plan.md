

# Live Data on Match Detail Page

## Problem
Currently, the match detail page has no auto-refresh for the main match data (`useMatch` has no `refetchInterval`). The `LiveMatchCard` polls the external API every 30 seconds, which is too slow for real-time feel. The match header always shows the static DB score, not the live API score.

## Changes

### 1. Update `src/hooks/useMatches.ts` — Add live polling to `useMatch`
- Accept an optional `status` parameter (or return it and let the caller decide)
- When the match status is live (`live`, `1H`, `2H`, `HT`, `ET`), set `refetchInterval: 10_000` (10s) so the DB score/status updates flow through
- This ensures the match header, predictions, and all dependent components stay fresh

### 2. Update `src/hooks/useFixtureData.ts` — Reduce polling to ~5 seconds for live matches
- Change `useLiveFixture` refetchInterval from `30_000` to `5_000` (5s) and staleTime from `15_000` to `3_000`
- Change `useFixtureEvents` refetchInterval from `30_000` to `5_000` (5s) and staleTime from `15_000` to `3_000`
- This makes goals and events appear within ~5 seconds (3s would be too aggressive for the upstream API rate limits)

### 3. Update `src/pages/MatchDetail.tsx` — Show live score in match header
- Pass match status to `useMatch` so it can enable polling
- When the match is live and `LiveMatchCard`'s fixture data has a live score, update the match header's center section to show the live score from the API (instead of the static DB `goals_home`/`goals_away`) with a pulsing green indicator and elapsed minute
- Add a live status badge (e.g., "LIVE 67'") next to the league badge

### 4. Update `src/components/LiveMatchCard.tsx` — Flash animation on new goals
- Add a brief flash/highlight animation when the score changes (using a `useRef` to track previous score and a CSS transition)

## Technical Notes
- 5-second polling is a practical minimum given API-Football rate limits (the proxy edge function makes upstream calls). Going to 3s risks hitting rate limits.
- The `useMatch` hook polling at 10s covers DB-side updates (status transitions, prediction refreshes) without excessive Supabase queries.
- No database changes required.

