

# Audit: Post-match reviews are NOT reliably generated after matches

## Finding: severe coverage gap

Across **all completed matches**: only **681 / 4,141 reviewed (16.4%)**. In the last 14 days, **163 of ~274 completed matches are missing a review** — including 13/15 from today and 45/51 from April 19. The pipeline is essentially non-functional on busy match days.

## Root cause: the trigger pipeline is too slow and too narrow

There is no dedicated cron for `generate-post-match-review`. AI reviews are only triggered as a side-effect of `batch-review-matches`, with these limits:

1. **Cron runs only once per day** (`batch-review-matches-daily` at 01:00). 
2. Each invocation processes **at most 6 AI reviews** (hard-coded `Math.min(unreviewedAI.length, 6)` in `batch-review-matches/index.ts`), with a 3-second sleep between each.
3. In `recent` mode it scans the **200 most recent completed matches**, ordered newest-first — so the 6-per-day cap can never catch up. On a 50-match day, **44 matches per day permanently slip out of the window**.
4. Backfill mode skips AI reviews entirely (`isBackfill ? [] : ...`), so older misses never get retried.
5. Matches without a prediction row (104 of the 163 misses) are also skipped — the loop requires `predMap.has(m.id)`. Many of these come from the pre-kickoff coverage gap we just fixed; old completed matches will never be eligible.

So even on a perfectly healthy day the system can only produce 6 reviews, while 20–50 matches complete.

## Fix

### 1. Dedicated cron for post-match reviews

Add a new edge function `auto-post-match-reviews` running **every 15 minutes**. It:
- Selects up to **40 completed matches** from the last 7 days where `ai_post_match_review IS NULL` and a prediction exists, oldest-first.
- Processes them with **bounded parallelism (3 concurrent)** calling `generate-post-match-review` with `system: true`.
- Stops early on 429/402 (Lovable AI rate limit / credits).
- Logs result counts to `prediction_logs` (`action='auto_post_match_reviews'`).

This gives ~160 reviews/hour capacity — easily enough for any match day.

### 2. Decouple from `batch-review-matches`

Remove the `Math.min(unreviewedAI.length, 6)` AI loop from `batch-review-matches/index.ts`. That function should only handle structured `prediction_reviews` (for ML calibration). The new cron above owns AI reviews.

### 3. Allow reviews without a stored prediction

In `generate-post-match-review/index.ts`, the `single()` call on `predictions` will throw if missing. Change to `.maybeSingle()` and make the prediction section of the prompt optional (already partially handled via `prediction ? ... : ""` template, but the destructuring will currently fail). This unblocks the 104 missing-prediction matches.

### 4. One-time backfill

Run `auto-post-match-reviews` manually 4–5 times after deploy to clear the 163-match backlog. Then ongoing cron keeps it at zero.

### 5. Monitoring

Extend `coverage-alert` to also count `status='completed' AND match_date > now() - 24h AND ai_post_match_review IS NULL` and log it. If >5, ops sees a trip-wire.

## Files to touch

| File | Change |
|---|---|
| `supabase/functions/auto-post-match-reviews/index.ts` (new) | Dedicated batched cron, bounded parallelism, rate-limit aware |
| `supabase/functions/generate-post-match-review/index.ts` | `.maybeSingle()` for prediction; null-safe prompt sections |
| `supabase/functions/batch-review-matches/index.ts` | Remove the 6-per-tick AI review loop |
| `supabase/functions/coverage-alert/index.ts` | Add post-match-review coverage metric |
| Cron | Add `auto-post-match-reviews` every 15 min |

## Verification (after deploy)

- `select count(*) from matches where status='completed' and match_date > now() - interval '24 hours' and ai_post_match_review is null` → 0 within an hour.
- `coverage-alert` returns `{missing_predictions: 0, missing_reviews: 0}`.
- Manually open any completed match from yesterday — review is present.

