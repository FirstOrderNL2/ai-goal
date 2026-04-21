

# Production-Safe ML Readiness — Fix Order (Temporal Consistency First)

The audit's verdict is correct: the system is a statistical engine with ML scaffolding, not an ML system, and the blocker is **temporal data consistency**, not model quality. This plan fixes the four risks in priority order. Nothing here introduces a new ML model — that remains gated until Phase 2 can be re-run on clean data.

---

## Priority 1 — Freeze enrichment & intelligence per match (CRITICAL)

**Problem:** `match_enrichment` and `match_intelligence` are mutable singletons per `match_id`. If `enrich-match-context` or `football-intelligence` is re-invoked after kickoff (manually, by cron, or by a future backfill), it overwrites the row that a snapshot already pointed at — silently corrupting historical training data.

**Fix:**
1. **Schema migration** — add freeze fields:
   - `match_enrichment.frozen_at TIMESTAMPTZ`, `frozen_for_match_date TIMESTAMPTZ`
   - `match_intelligence.frozen_at TIMESTAMPTZ`, `frozen_for_match_date TIMESTAMPTZ`
2. **Edge function guards** — in `enrich-match-context` and `football-intelligence`:
   - Refuse to write if a row exists with `frozen_at IS NOT NULL`.
   - On every successful pre-match write, also set `frozen_at = now()` and `frozen_for_match_date = matches.match_date` **only when `now() < match_date`**.
   - After kickoff, the row becomes immutable.
3. **Snapshot consumer** (`generate-statistical-prediction`) — read enrichment/intelligence only when:
   - row's `enriched_at`/`generated_at` < `match_date` **AND**
   - either `frozen_at IS NULL` (still pre-match) or `frozen_for_match_date = match_date` (frozen for this fixture).
   Otherwise treat as missing (already does this for the timestamp check; freeze adds the second guard).

---

## Priority 2 — Eliminate the backfill time-travel bug

**Problem:** `backfill-training-predictions` calls the live `generate-statistical-prediction` pipeline. The temporal guard nullifies post-match enrichment, but `match_features` (rolling form, lambdas) is recomputed from current `team_statistics`, which already includes the match itself.

**Fix:**
1. **`compute-features` audit** — verify rolling windows exclude the target match. If form/lambdas use season aggregates that include the completed match, add `WHERE matches.match_date < target.match_date` filters.
2. **Backfill mode flag** — pass `{ backfill: true, as_of: match_date }` from `backfill-training-predictions` to `generate-statistical-prediction`. The function:
   - Recomputes `match_features` with a strict `match_date < as_of` cut.
   - Skips matches lacking sufficient pre-`as_of` history (instead of silently using future data).
3. **Snapshot annotation** — store `as_of` and `backfill: true` inside `feature_snapshot` so any later audit can distinguish backfilled rows from live rows.

---

## Priority 3 — Coverage push (snapshots ≥ 2,000, odds ≥ 80%)

**Problem:** snapshot coverage stalled at 499/528 live + a few hundred backfilled; odds at ~58% on published predictions.

**Fix:**
1. **Cron-driven snapshot loop** — schedule `run-backfill-loop` (`target: predictions`, `max_iterations: 3`, `batch: 25`) every 5 minutes via `pg_cron` until `feature_snapshot` count ≥ 2,000. Auto-stops when exhausted.
2. **Cron-driven odds loop** — same pattern, `target: odds`, `scope: completed`, every 15 minutes, capped to API-Football quota budget already in `api-usage-strategy`.
3. **KPI gate UI** — add a small status strip to `MLReadinessPanel.tsx` showing live counts and a green/red badge per KPI. No GO until all four go green.

---

## Priority 4 — Enforce dataset hygiene flags globally

**Problem:** `training_only` and `publish_status` exist but aren't enforced consistently in queries.

**Fix:**
1. **Production reads** (everything that powers UI predictions): add `training_only = false AND publish_status = 'published'` to:
   - `useMatches`, `useFixtureData`, `useModelPerformance`, `MatchDetail`, `Accuracy`, `compute-model-performance` training input.
2. **ML/training reads** (dataset-validation-report, future ML loaders): explicitly opt-in with `training_only IN (true,false)` and clearly label which slice they are reading.
3. **Lint rule** — none enforceable, but add a code comment header in `predictions` query helpers documenting the rule, and a single `predictionFilters.ts` helper exporting `productionFilter()` and `trainingFilter()` so future code reuses them.

---

## Out of scope (deferred)

- LightGBM training (Phase 2) — re-run only after Priorities 1–3 are green.
- Logloss / ECE in `compute-model-performance` — added together with Phase 2 evaluation harness.
- Hybrid blending in production — never until Phase 2 verdict is GO.

---

## Files touched

**Migrations**
- `supabase/migrations/<ts>_freeze_enrichment_intelligence.sql`

**Edge functions**
- `supabase/functions/enrich-match-context/index.ts` (freeze write + refusal)
- `supabase/functions/football-intelligence/index.ts` (freeze write + refusal)
- `supabase/functions/generate-statistical-prediction/index.ts` (frozen-row guard + `as_of`/`backfill` snapshot annotation)
- `supabase/functions/compute-features/index.ts` (strict `match_date < as_of` rolling windows)
- `supabase/functions/backfill-training-predictions/index.ts` (pass `as_of` + `backfill: true`)
- `supabase/functions/run-backfill-loop/index.ts` (no change; just scheduled)

**Cron (`pg_cron` + `pg_net`)**
- snapshot loop every 5 min
- odds loop every 15 min

**Frontend**
- `src/components/MLReadinessPanel.tsx` (KPI gate strip)
- `src/lib/predictionFilters.ts` (new helper)
- `src/hooks/useMatches.ts`, `useFixtureData.ts`, `useModelPerformance.ts`, `src/pages/MatchDetail.tsx`, `src/pages/Accuracy.tsx` (apply `productionFilter()`)

---

## Success criteria

- Re-run `dataset-validation-report` shows: snapshots ≥ 2,000, odds ≥ 80% on published, 0 orphans, referees > 0.
- `match_enrichment` / `match_intelligence` rows for completed matches are immutable (write attempts return refusal).
- `feature_snapshot` rows produced by backfill carry `as_of` ≤ `match_date` and `backfill: true`.
- All UI prediction reads exclude `training_only = true`.
- Only after all four pass: re-run Phase 2 benchmark on the now-trustworthy ≥2k dataset.

