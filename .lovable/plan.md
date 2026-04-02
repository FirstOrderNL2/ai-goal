

# Fix Missing Scores & Stale Match Bugs

## Problems Found

1. **Chelsea Women vs Arsenal Women shows 0-0** — was manually patched incorrectly. The actual score was **1-0** (Chelsea won, per your screenshot). The scraped UWCL matches have no `sportradar_id` so the sync never updates them.

2. **41 completed matches have NULL goals** — the Sportradar sync fetches schedules which contain scores, but the `team+date` matching path (line 338-346) only links `sportradar_id` without backfilling scores. So matches that were created by the scraper and later matched by Sportradar still have no scores.

3. **Scraped matches can never get scores** — `scrape-matches` only creates upcoming matches and never re-scrapes to update scores. UWCL matches come from scraping, not Sportradar (UWCL isn't in `ALL_LEAGUES`).

4. **MatchCard shows `null - null` for completed matches** — when `goals_home`/`goals_away` are NULL but status is "completed", the card renders empty scores.

## Fix Plan

### 1. Fix the team+date matching to also backfill scores
**File: `supabase/functions/sync-sportradar-data/index.ts`**
- In the team+date matching block (around line 338-346), when a match is found by team+date, also update `goals_home`, `goals_away`, `status`, and `sportradar_id` — not just `sportradar_id`

### 2. Fix Chelsea Women vs Arsenal Women score
**Database migration** — update the match `edefd315-e587-44d4-85ed-16bf595b3f4b` to the correct score: 1-0

### 3. Add UWCL to Sportradar sync
**File: `supabase/functions/sync-sportradar-data/index.ts`**
- Add Women's Champions League season to `ALL_LEAGUES` so future UWCL matches get `sportradar_id` and scores automatically
- Add Women's team name aliases (e.g. "Chelsea FC Women" → "chelsea women")

### 4. Handle NULL scores in MatchCard
**File: `src/components/MatchCard.tsx`**
- When status is "completed" but goals are null, show "FT" or a dash instead of "null - null"

### 5. Make scrape-matches update scores for past matches
**File: `supabase/functions/scrape-matches/index.ts`**
- Currently skips matches where `new Date(matchDate) < new Date()` — instead, for past matches, check if they exist in DB and update scores if the scraped data includes them
- Update the AI extraction prompt to also extract scores from completed matches

## Files to Change

| File | Change |
|---|---|
| DB migration | Fix Chelsea Women vs Arsenal Women score to 1-0 |
| `supabase/functions/sync-sportradar-data/index.ts` | Backfill scores in team+date match path; add UWCL season + women's team aliases |
| `supabase/functions/scrape-matches/index.ts` | Update scores for past matches; extract scores from scraped content |
| `src/components/MatchCard.tsx` | Handle null goals gracefully for completed matches |

