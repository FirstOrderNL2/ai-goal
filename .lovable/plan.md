

# Fix Played Matches Showing as Upcoming

## Problem

The Bayern Munich Women vs Manchester United Women match was played on **April 1, 2026 at 18:45 CET**, but is stored in the database as `2026-04-02T16:45:00+00:00` (upcoming). Multiple UWCL matches likely have wrong dates for the same reason.

**Root cause**: The scraper ran at `2026-04-02T00:02:49 UTC` (just after midnight). The AI model extracted "April 2" as the date (probably reading "today" or "tomorrow" references on Dutch sites relative to midnight). The match was already played hours before the scrape ran.

Similarly, Chelsea Women vs Arsenal Women (second leg) on April 2 at 19:00 UTC and Barca vs Real Madrid Women may have wrong dates or be duplicates of first-leg matches.

## Fix Plan

### 1. Database fix: Correct Bayern Women match immediately
Update match `71347f3b` to the correct date (April 1, 16:45 UTC), score (2-1), and status (completed). Also check and fix the other UWCL matches with wrong dates:
- Chelsea vs Arsenal `86da1647` (Apr 2 19:00) — verify if this is a real second leg on Apr 2 or a misdate
- Barca vs Real Madrid `19192519` (Apr 2 16:45) — verify
- Lyon vs Wolfsburg `4ec1d391` (Apr 2 19:00) — verify

### 2. Scraper: Add timezone-aware date handling
**File: `supabase/functions/scrape-matches/index.ts`**
- Change AI prompt to include the current UTC time (not just date) and instruct the model: "Times shown on Dutch sites are in CET/CEST (Europe/Amsterdam). Convert all dates/times to UTC."
- Update the `matchDate` construction to use proper IANA timezone conversion instead of hardcoded `+02:00`. April is in CEST (+02:00) but winter months are CET (+01:00).
- Add validation: if the AI extracts a match date that is in the past but has no score, flag it and skip or mark as completed.

### 3. Auto-sync: Smarter stale match detection
**File: `supabase/functions/auto-sync/index.ts`**
- Current cutoff is 2 hours after `match_date`. This works IF the date is correct.
- No change needed here since the root cause is wrong dates, not the cutoff logic.

### 4. Frontend: Display times in Europe/Berlin
**File: `src/pages/MatchDetail.tsx`**
- Format match dates using `Europe/Berlin` timezone via `date-fns-tz` or `Intl.DateTimeFormat`
- Show timezone indicator (e.g., "CET" or "CEST")

**File: `src/components/MatchCard.tsx`**
- Same timezone formatting for match times on cards

**File: `src/hooks/useMatches.ts`**
- Add `refetchInterval: 5 * 60 * 1000` (5 minutes) so matches auto-refresh

### 5. Scraper: Better dedup window
**File: `supabase/functions/scrape-matches/index.ts`**
- Expand dedup window from same-day to +/- 1 day to catch date-off-by-one errors
- When a match already exists within that window, skip instead of creating a duplicate

## Files to Change

| File | Change |
|---|---|
| DB (data update) | Fix Bayern Women match date to Apr 1, set score 2-1, mark completed. Verify other UWCL matches. |
| `supabase/functions/scrape-matches/index.ts` | Fix timezone handling, improve AI prompt with UTC awareness, expand dedup window |
| `src/pages/MatchDetail.tsx` | Format dates in Europe/Berlin timezone |
| `src/components/MatchCard.tsx` | Format dates in Europe/Berlin timezone |
| `src/hooks/useMatches.ts` | Add refetchInterval for auto-refresh |

