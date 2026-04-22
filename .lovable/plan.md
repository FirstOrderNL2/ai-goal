

# ML Evolution → Production Path: Phases 1–2 + 5.3

## Scope decision

Your plan is large (6 phases). Most of Phases 3–6 require capabilities that don't exist yet (LightGBM training inside an edge function, ONNX runtime, A/B framework) and shouldn't be built until the data foundation is verified clean for several weeks. So this run delivers the **foundation phases** that make everything else safe:

- **Phase 1** (data cleanliness) — fully implementable now
- **Phase 2.1 + 2.2** (coverage guarantee + nightly reconciliation) — extends what already exists
- **Phase 5.3** (recheck logging verification) — re-check the fix from last pass actually fires
- **Phase 5.1** (leakage detection view) — read-only monitoring

Phases 2.3 (timeline engine), 3 (ML pipeline), 4 (hybrid weights), 5.2 (full dashboard), and 6 (live inference / A/B) are **out of scope** for this run — they need either more data (≥1,000 clean samples; we have 296) or architectural decisions worth their own plans.

## Current state (verified live)

- `ml_readiness_v` was fixed last pass → reports 296 clean labels (correct).
- `predictions.feature_snapshot` has no `snapshot_version` field. Adding one now is cheap; backfilling old rows as `v0` lets us train only on `v1+` going forward.
- `enrich-match-context` and `football-intelligence` already reject post-kickoff writes (last pass). `predictions` table has no equivalent guard — `generate-statistical-prediction` can still write after kickoff.
- `prediction_logs.update_reason` distribution last 24h is unknown until we re-query post-deploy; the fix landed but needs verification.
- Nightly safety-net for missing predictions doesn't exist; coverage relies on the auto-sync cron.

## Changes

### Phase 1.1 — `ml_ready_predictions` view
New SQL view (read-only, public-readable) returning only rows where `p.created_at <= m.match_date AND p.feature_snapshot IS NOT NULL`. This becomes the canonical training source — `ml_readiness_v` already counts the same set; the view exposes the rows themselves.

### Phase 1.2 — Freeze `predictions` after kickoff
Add to `generate-statistical-prediction/index.ts`: before the upsert, fetch `matches.match_date`. If `Date.now() > match_date` AND a row already exists (any status), refuse to overwrite. Insert a `prediction_logs` row with `update_reason='post_kickoff_blocked'` and return `{ skipped: true }`. Mirrors the guard added to `enrich-match-context` last pass.

### Phase 1.3 — Schema versioning
Migration: add column `predictions.snapshot_version text default 'v1'`. Backfill historical rows: every existing row → `'v0'` (so they're identifiable as the legacy schema). Update `generate-statistical-prediction` to stamp `'v1'` on every new write, and add `snapshot_version: 'v1'` inside `feature_snapshot` itself for redundancy. Update `ml_ready_predictions` view to expose this column. **No ML training change yet** — versioning just becomes available for when training resumes.

### Phase 1.4 — Backfill classification
Audit query: confirm zero rows with `training_only=true` are also `created_at <= match_date` (would be a misclassification). If any exist, flip them to `false` via insert tool. The backfill rows from earlier (`created_at > match_date`) are already excluded from `ml_ready_predictions` by the timestamp filter, so no extra flag is needed.

### Phase 2.1 + 2.2 — Coverage + nightly reconciliation
- Phase E in `pre-match-predictions` (added last pass) already covers the 15-min window. Extend it: also force-generate for any match in **next 24h** with no row at all (currently only handles `failed`/`pending`).
- New edge function `nightly-prediction-reconcile/index.ts`: scans next 48h for matches missing predictions, calls `generate-statistical-prediction` for each (capped at 100/run). Cron schedule: 02:30 Berlin daily.

### Phase 5.1 — Leakage detection view
New SQL view `data_integrity_v` exposing single-row health metrics:
- `late_enrichment_count` — `match_enrichment` rows where `enriched_at > match_date AND frozen_at IS NULL`
- `late_intelligence_count` — same for `match_intelligence`
- `late_predictions_count` — `predictions` where `created_at > match_date`
- `prediction_coverage_24h_pct` — % of next-24h matches with a row
- `recheck_distribution_24h` — JSON of `update_reason` counts from last 24h

### Phase 5.3 — Recheck verification
SQL probe (read-only) post-deploy to confirm `recheck_60/30/15/10/5` are firing. If still all-`initial`, dig into `pre-match-predictions` Phase B logic. No code change unless the probe shows it's still broken.

### PipelineHealthCard extension
Add a "Data Integrity" sub-card reading from `data_integrity_v`: late-write counts, coverage %, and a small badge per recheck window. This is the user-facing version of Phase 5.2 — minimal, just the critical signals, not a full dashboard.

## Files touched

- New migration — `ml_ready_predictions` view, `data_integrity_v` view, `predictions.snapshot_version` column + `'v0'` backfill
- `supabase/functions/generate-statistical-prediction/index.ts` — post-kickoff guard, stamp `snapshot_version='v1'`
- `supabase/functions/pre-match-predictions/index.ts` — extend Phase E to cover missing-row case in next 24h
- New `supabase/functions/nightly-prediction-reconcile/index.ts` + cron at 02:30 Berlin
- `src/components/PipelineHealthCard.tsx` — Data Integrity sub-card
- One-shot SQL probe for recheck distribution (no committed file)

## Out of scope (intentional)

- **Phase 2.3 timeline engine** — current Phase B already handles 60→5min rechecks; rebuilding as discrete T-N actions adds complexity without proven gain.
- **Phase 3 (ML training pipeline)** — only 296 clean samples; training infrastructure premature until ≥1,000.
- **Phase 4 (hybrid weights)** — same data-volume blocker. Last pass's offline benchmark stands as the reference until more data lands.
- **Phase 5.2 full dashboard** — the sub-card covers the critical signals; full dashboard is UI work that can wait.
- **Phase 6 (ONNX / live inference / A/B)** — needs trained production model first.

## Success criteria (verifiable post-deploy)

- `SELECT count(*) FROM ml_ready_predictions` returns ~296 (same as `ml_readiness_v.labeled_samples`).
- `predictions.snapshot_version` populated: existing rows = `'v0'`, new rows = `'v1'`.
- New `generate-statistical-prediction` call after kickoff returns `{ skipped: true }` and does not overwrite.
- `data_integrity_v.late_predictions_count` = 0 within 24h of deploy.
- `nightly-prediction-reconcile` runs at 02:30 Berlin and logs processed count.
- PipelineHealthCard shows a Data Integrity panel with all four metrics live.
- Recheck probe shows non-`initial` distribution; if not, raise as P0 in the same run.

