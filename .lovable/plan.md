

# Data Growth Engine v1 — unlock the 1,744-match label goldmine + traceability

## Current state (verified live)

- 4,124 completed matches with scores, only **290 reviewed** → **1,744 completed matches have predictions but no review** (the gap is real and large).
- `batch-review-matches` already exists and works correctly, but is capped at **200 matches/run**, only runs in `auto-sync` modes `full`/`idle`, and orders by `match_date DESC` so the same recent slice gets reprocessed every cycle while older matches starve.
- `prediction_logs.update_reason` is **NULL on all 166 rows** — `pre-match-predictions` writes logs but never stamps the recheck window (`recheck_60`/`30`/`15`/`10`/`5`). Step 3 of your plan is a real bug, not a feature gap.
- Last 6h: 150 `failed` / 11 `success` / 5 `partial` generations — the P0 hotfix landed but failures are still dominant. Worth one more look as part of this pass.
- Coverage guarantee (Step 4) and ML readiness tracker (Step 5) are not implemented.

## Changes

### 1. Backfill the 1,744 missing labels (one-shot + permanent)

**`supabase/functions/batch-review-matches/index.ts`**
- Add `mode` param: `recent` (default, current behaviour) or `backfill` (oldest-first, no recency filter).
- Raise per-run cap: 200 → **500** in backfill mode.
- Skip the AI post-match review section entirely when `mode='backfill'` (rate limits would kill it; we only need the structured `prediction_reviews` row to label the dataset).

**New function `supabase/functions/run-review-backfill/index.ts`** (mirrors `run-backfill-loop`):
- Loops `batch-review-matches?mode=backfill` until `processed === 0` or 20 iterations hit.
- One manual invocation post-deploy → expected to insert ~1,700 review rows in a few minutes.

**Cron**: add a daily `batch-review-matches` (default mode) at 03:00 Berlin to keep coverage at 100% as new matches complete. Auto-sync already calls it in full/idle but only when it triggers full mode — making it explicit removes the dependency.

### 2. Make rechecks traceable (fix Step 3)

**`supabase/functions/pre-match-predictions/index.ts`** — every call to `generate-statistical-prediction` and every `prediction_logs` insert must pass `update_reason` based on the kickoff window:
- T > 60min → `initial`
- 60 ≥ T > 30 → `recheck_60`
- 30 ≥ T > 15 → `recheck_30`
- 15 ≥ T > 10 → `recheck_15`
- 10 ≥ T > 5 → `recheck_10`
- T ≤ 5 → `recheck_5`
- HT phase → `ht_snapshot`
- Phase D watchdog → `retry`

**`supabase/functions/generate-statistical-prediction/index.ts`** — accept `update_reason` from request body, persist on the `predictions` row AND in the `prediction_logs` insert. Also stamp `last_prediction_at` on every successful write so freshness is queryable.

### 3. Coverage guarantee — "no kickoff without prediction"

Add a **Phase E final-call** to `pre-match-predictions`: any match starting in **next 15 minutes** with no `predictions` row OR `generation_status IN ('failed','pending')` → force-generate immediately, bypassing the per-tick caps. Caps stay for normal load; emergencies don't.

This is the formal version of Step 4. We already had Phase D for failures; Phase E is the kickoff-imminent safety net.

### 4. Investigate residual generation failures

Quick read of `prediction_logs.error` distribution + 1-2 representative edge-function log lines for the 150 failures. Either fix the root cause or document it. Done in the same pass — no separate plan needed.

### 5. ML readiness tracker

**Migration**: new view `ml_readiness_v` (no table; just a SQL view RLS-public):
```sql
SELECT 
  (SELECT COUNT(*) FROM prediction_reviews WHERE actual_outcome IS NOT NULL) AS labeled_samples,
  (SELECT COUNT(*) FROM predictions WHERE feature_snapshot IS NOT NULL) AS feature_snapshots,
  (labeled_samples::float / NULLIF(feature_snapshots,0)) AS label_coverage,
  CASE WHEN labeled_samples >= 2000 THEN 'ready' ELSE 'collecting' END AS ml_status,
  GREATEST(0, 2000 - labeled_samples) AS samples_to_target
```

**`src/components/PipelineHealthCard.tsx`** — extend with a "ML Readiness" sub-section: progress bar (current / 2000), label coverage %, and an `ml_status` badge. No model trigger yet — that's a separate decision when the bar fills.

### 6. Optional cleanup

`useMatches.ts` defensive `console.warn` from the previous pass — leave it; harmless and useful.

## Files touched

- `supabase/functions/batch-review-matches/index.ts` — add `mode`, raise cap, skip AI in backfill
- New `supabase/functions/run-review-backfill/index.ts` — loop driver
- `supabase/functions/pre-match-predictions/index.ts` — window→reason tagging + Phase E coverage guard
- `supabase/functions/generate-statistical-prediction/index.ts` — accept and persist `update_reason`, stamp `last_prediction_at`
- Migration: `ml_readiness_v` view
- `src/components/PipelineHealthCard.tsx` — ML readiness sub-card
- One-shot invocation of `run-review-backfill` post-deploy
- New daily cron for `batch-review-matches`

## Out of scope (intentional)

- Building the actual ML training trigger — only the readiness signal. You'll decide what to do at 2,000 labels (likely the Python pipeline from last pass, productionized).
- Changes to the publish gate (already aligned).
- Schema changes to `predictions` or `prediction_logs` — both already have the columns we need.

## Success criteria (verifiable within minutes of deploy)

- `prediction_reviews` row count jumps from 290 → ~2,000 after the one-shot backfill.
- `prediction_logs.update_reason` shows non-NULL distribution across `initial`, `recheck_*`, `retry` within one pre-match cycle.
- Any upcoming match within 15 min of kickoff with no prediction triggers a force-gen and appears in logs as `update_reason='retry'` `action='generate'`.
- `/accuracy` PipelineHealthCard shows an ML Readiness bar at ~2000/2000 (or close) and `ml_status='ready'`.
- Generation failure rate drops below 20% for the next hour (post root-cause look).

