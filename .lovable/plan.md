

# Show Live Match Time on Match Detail Page

## Problem
The LIVE badge in the match header shows "LIVE" but when the live fixture API data hasn't loaded yet (or `liveElapsed` is null), it falls back to `liveStatusShort` which may also be empty — leaving just "LIVE" with no time context.

## Changes

**File: `src/pages/MatchDetail.tsx`**
- Update the LIVE badge fallback to also use `match.status` (e.g. "1H", "2H", "HT") when neither `liveElapsed` nor `liveStatusShort` are available
- Below the score, show the match status label (e.g. "1st Half", "2nd Half", "Half Time") as a fallback when `liveElapsed` is null, so there's always time context visible under the scoreline
- Compute an estimated elapsed minute from `match.match_date` and current time when the API elapsed value is unavailable (for 1H/2H status)

This ensures users always see timing info (e.g. "LIVE 34'" or "LIVE 1H" or "LIVE HT") on the match detail page header and below the score.

