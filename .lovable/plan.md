

# Add Live Matches Section + Pre-Match Prediction Scheduling

## Problem

1. **No "Live" section on dashboard**: The Index page only queries `status = "upcoming"` and `status = "completed"`. There is 1 live match and 8 cancelled matches in the DB — live matches are invisible on the homepage.
2. **Predictions are not auto-generated before kickoff**: Currently predictions are only generated during the `auto-sync` cron or manually. There is no mechanism to trigger predictions at specific intervals before a match starts (1h, 30m, 10m, 5m).

## Plan

### 1. Add `useLiveMatches` hook and Live section to Index page

**`src/hooks/useMatches.ts`**:
- Add a new `useLiveMatches(league?)` query that fetches matches with `status` in `('live', '1H', '2H', 'HT')`.
- Use a 30-second `refetchInterval` for real-time updates.
- Apply the same league filter and API-Football dedup logic as upcoming.

**`src/pages/Index.tsx`**:
- Import `useLiveMatches`.
- Add a new "Live Matches" section at the top (above Upcoming), with a pulsing green indicator icon.
- Only render the section when there are live matches (hide when empty).
- Show the live match cards with the existing `MatchCard` component (which already handles live badges).

### 2. Create `pre-match-predictions` edge function

**`supabase/functions/pre-match-predictions/index.ts`** (new):
- Query upcoming matches where `match_date` is within the next 60 minutes.
- For each match, check if a prediction already exists and when it was last generated.
- Generate/regenerate predictions for matches at the 60m, 30m, 10m, and 5m windows before kickoff.
- Use a `prediction_generated_intervals` tracking approach: store a JSONB field or check `predictions.created_at` to avoid duplicate generation at the same interval.
- Call the existing `generate-ai-prediction` function for each match that needs a prediction refresh.
- Include rate limiting (process max 5 matches per invocation with delays).

### 3. Update `auto-sync` to call `pre-match-predictions`

**`supabase/functions/auto-sync/index.ts`**:
- Add a step after batch-generate-predictions to call `pre-match-predictions`.
- This ensures every auto-sync run also checks for imminent matches needing fresh predictions.

### 4. Add `last_prediction_at` column to predictions table

**Database migration**:
- Add `last_prediction_at timestamptz` to the `predictions` table to track when the prediction was last refreshed.
- Add `prediction_intervals jsonb DEFAULT '[]'` to track which pre-match intervals have been processed (e.g., `["60m", "30m"]`).

### 5. Schedule frequent cron job for pre-match predictions

- Schedule `pre-match-predictions` to run every 10 minutes via pg_cron so it catches the 60m, 30m, 10m, and 5m windows reliably.

### 6. Also fix `auto-sync` stale match logic

The current `auto-sync` marks matches as `completed` after 2 hours but never sets them to `live`. The sync functions should be updating match status to `live` when API-Football reports an in-progress status. This is likely already handled in `sync-football-data` but needs verification — if not, add status mapping from API-Football fixture statuses (`1H`, `2H`, `HT`, `ET`, `P`) to `live`.

## Files to Change

| File | Change |
|---|---|
| `src/hooks/useMatches.ts` | Add `useLiveMatches` hook |
| `src/pages/Index.tsx` | Add Live Matches section above Upcoming |
| `supabase/functions/pre-match-predictions/index.ts` | New — scheduled pre-match prediction generator |
| `supabase/functions/auto-sync/index.ts` | Add call to pre-match-predictions |
| `supabase/migrations/new` | Add `last_prediction_at` and `prediction_intervals` to predictions |

## Priority

1. Live matches section on dashboard (immediate user visibility)
2. Pre-match prediction scheduling function + migration
3. Cron job setup for 10-minute intervals

