

# Prediction Scheduling Redesign

## Current Issues
1. **Bug**: `pre-match-predictions` sends `{ matchId }` but `generate-ai-prediction` expects `{ match_id }` — predictions never actually generate
2. **Wrong interval logic**: Current code checks fixed windows (60m, 30m, 10m, 5m) and skips if already done — should regenerate every 10 minutes continuously
3. **No halftime prediction**: No logic to detect HT matches and generate one final in-match prediction
4. **No pre-match snapshot**: Need to preserve the last pre-kickoff prediction before halftime overwrites it

## Plan

### 1. Database Migration
Add `pre_match_snapshot` (jsonb) column to `predictions` table to store the last pre-kickoff prediction before halftime regeneration.

### 2. Rewrite `pre-match-predictions/index.ts`

New logic (runs every 10 min via existing cron):

**Phase A — Initial predictions** (matches without any prediction):
- Query upcoming matches with no prediction row
- Call `generate-ai-prediction` with `{ match_id }` (fix the field name)
- Limit 5 per run

**Phase B — Pre-match refresh** (matches within 60 min of kickoff):
- Query upcoming matches where kickoff is within 60 minutes
- For each, check `last_prediction_at` — if older than 9 minutes, regenerate
- This naturally creates a ~10-min refresh cadence aligned with the cron
- Update `prediction_intervals` array with timestamp entries for audit
- Limit 5 per run

**Phase C — Halftime prediction** (live matches at HT):
- Query matches with `status = 'HT'`
- Check `prediction_intervals` for `"HT"` — skip if already done
- Before regenerating, snapshot current prediction data into `pre_match_snapshot`
- Call `generate-ai-prediction` to get an updated halftime prediction
- Mark `"HT"` in intervals so it only runs once
- Limit 3 per run

### 3. Trigger immediate batch for matches without predictions
Call `batch-generate-predictions` to generate predictions for all 954 upcoming matches that currently lack them (in batches of 10).

### Files Changed
| File | Change |
|---|---|
| `supabase/functions/pre-match-predictions/index.ts` | Full rewrite with 3-phase logic |
| Migration | Add `pre_match_snapshot jsonb` to predictions |

### Prediction Timeline (per match)
```text
Time          Action
─────────────────────────────────────
Any time      Initial prediction (batch)
T-60 min      Regenerate (cron picks up)
T-50 min      Regenerate
T-40 min      Regenerate
T-30 min      Regenerate
T-20 min      Regenerate
T-10 min      Regenerate (last pre-match)
T-0           Kickoff — no more pre-match
Halftime      Snapshot pre-match → regenerate once
Post-HT       No more predictions
```

