

# Fix Scraper Data Accuracy

## Current State

The database is actually **correct** right now:
- Bayern Women vs Man Utd Women: Apr 1, completed, 2-1 ✅
- Chelsea Women vs Arsenal Women (first leg): Apr 1, completed, 1-0 ✅
- **FC Barcelona Women vs Real Madrid Women: Apr 2 18:45 CET, upcoming** ✅ (confirmed by user's screenshot — match is today, not yet played)
- Chelsea Women vs Arsenal Women (second leg): Apr 2 21:00 CET, upcoming — **real second leg, keep**
- Lyon Women vs Wolfsburg Women: Apr 2 21:00 CET, upcoming — **real second leg, keep**

The previous plan proposed deleting these 3 Apr 2 matches as "ghost duplicates" — that was **wrong**. They are real UWCL QF second legs. No database changes needed.

## Scraper Bugs to Fix

The scraper has two accuracy problems that caused all the confusion in this conversation:

### Bug 1: Dedup catches real two-legged ties as duplicates
The dedup check (lines 300-307) looks for same `team_home_id + team_away_id` within +/- 1 day. For cup competitions with two-legged ties (e.g., Chelsea home vs Arsenal away on Apr 1 AND Apr 2), the second leg gets caught as a "duplicate" and skipped or overwritten. This means if the scraper runs again, it could skip real second legs.

**Fix**: Add a `round` field to the AI extraction schema. When round info is available (e.g., "Leg 1", "Leg 2", "Kwartfinale wedstrijd 1 van 2"), use it to distinguish entries. Only dedup when round info matches or is absent for both.

### Bug 2: AI prompt doesn't extract round/leg info
The AI extraction schema has no `round` field, so we can't distinguish "Quarter-final Leg 1" from "Quarter-final Leg 2" even when the source page shows it (the user's screenshot clearly shows "Kwartfinale · Wedstrijd 2 van 2").

**Fix**: Add `round` field to the tool schema. Update the AI system prompt to explicitly extract round/leg information.

### Bug 3: Reverse-direction dedup missing
For two-legged ties where home/away swap between legs (Real Madrid home vs Barcelona away on Apr 1, then Barcelona home vs Real Madrid away on Apr 2), the current dedup would NOT catch them since the team IDs are in different positions. This is actually fine — but if the scraper extracts both legs with the SAME home/away order (which happens with Dutch sources), the dedup incorrectly catches the second leg.

**Fix**: When `round` info differs (e.g., "Leg 1" vs "Leg 2"), skip dedup entirely.

## Changes

| File | Change |
|---|---|
| `supabase/functions/scrape-matches/index.ts` | Add `round` field to AI extraction schema and prompt; use round info in dedup logic — only treat as duplicate when round matches or both are null; store round in match insert if DB column exists |

### No database migration needed
- All 3 Apr 2 UWCL matches are real and should stay
- The `matches` table doesn't have a `round` column yet — add one via migration to store round/leg info for future use

| Target | Change |
|---|---|
| DB migration | Add `round` column (text, nullable) to `matches` table |
| `supabase/functions/scrape-matches/index.ts` | Extract round info from AI, use in dedup, store in DB |

