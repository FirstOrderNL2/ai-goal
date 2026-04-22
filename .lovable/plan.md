

# Goal: Every match must have a published prediction before kickoff

## Root cause

Two issues compounding:

1. **Coverage gap before kickoff**: `pre-match-predictions` runs every 10 min but caps the 24h coverage sweep (Phase F) at **20 matches/tick**. On busy weekends (100+ kickoffs in a few hours) the queue overflows → matches reach kickoff with no prediction row.
2. **Silent post-kickoff fallback**: `backfill-training-predictions` (cron every 5 min) sees those matches *after* they finished, generates a prediction with `training_mode: true`, which writes `publish_status: 'training_only'` and `training_only: true`. The UI filter (`useMatches.ts`) hides anything not `published`, so they look "missing" forever — even though a prediction technically exists.

DB confirms: **116 recent completed matches** have a `training_only` prediction created *after* kickoff. Zero of them ever had a real pre-match prediction.

## Fix strategy

Three changes, in order of importance:

### 1. Stop backfill from masking misses (the bleeding)

In `backfill-training-predictions/index.ts`, **never write a training_only prediction for a match the user could have seen pre-kickoff**. Only backfill matches older than e.g. 7 days (true ML training data). Anything more recent must either get a real pre-match prediction or stay flagged as missing for ops to see.

Effectively: change the candidate query to `match_date < now() - interval '7 days'`. Recent misses then become visible in monitoring instead of being silently buried.

### 2. Guarantee pre-kickoff coverage (the real fix)

Rework `pre-match-predictions/index.ts` so that **no upcoming match within 6 hours can ever be skipped**:

- **Phase F (24h sweep)**: remove the `COVERAGE_CAP = 20` limit for matches kicking off within 6 hours. Keep a soft cap (e.g. 50) only for the 6h–24h window. Process all <6h matches every tick.
- **Phase E (15-min coverage guard)**: already force-generates, but currently runs sequentially with 800ms delays — at 50 matches that's 40s+ and may time out. Switch to bounded parallelism (5 concurrent) for matches inside 30 min.
- **Schedule**: increase pre-match-predictions cron from every 10 min to **every 5 min**. Combined with the unlimited <6h sweep, this closes the window where a match can slip through.

### 3. Add a hard "kickoff with no published prediction" alarm

Add a new edge function `coverage-alert` (cron every 5 min) that:
- Counts matches with `match_date BETWEEN now()-2h AND now()` that have no published prediction (`publish_status='published' AND training_only=false`).
- Writes to `prediction_logs` with `action='coverage_alert'` so the issue is queryable.
- Returns the list in the response for manual inspection.

This gives an objective trip-wire so the regression can't return silently.

### 4. One-time cleanup of the 116 invisible predictions

Run a one-shot SQL to either:
- Delete the `training_only` predictions on completed matches from the last 14 days (cleanest — they're useless to the UI and never went through the real pre-kickoff path, so they're not even valid ML training rows for "what we predicted live"), **or**
- Mark them with `update_reason='post_kickoff_backfill'` so analytics can exclude them.

Recommend deletion — they pollute the ML calibration loop too.

## Files to touch

| File | Change |
|---|---|
| `supabase/functions/backfill-training-predictions/index.ts` | Add `match_date < now() - 7 days` filter |
| `supabase/functions/pre-match-predictions/index.ts` | Remove cap for <6h matches in Phase F; parallelize Phase E |
| `supabase/functions/coverage-alert/index.ts` (new) | Trip-wire alert function |
| Cron schedule | `pre-match-predictions` 10m → 5m; add `coverage-alert` every 5m |
| One-shot migration | Delete the 116 stale `training_only` rows on recent completed matches |

## Verification

After deploy:
- `select count(*) from predictions p join matches m on m.id=p.match_id where m.status='completed' and m.match_date > now()-interval '24 hours' and (p.publish_status!='published' or p.training_only=true)` → should be 0.
- `coverage-alert` return body should be `{missing: 0}` on every tick.
- UI dashboard "completed matches" section shows predictions for every match in major leagues over the past week.

