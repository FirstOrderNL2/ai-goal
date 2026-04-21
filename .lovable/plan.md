

# ML Readiness Upgrade — Data Foundation

Goal: capture every prediction's full feature vector, backfill history, repair odds coverage, and lock referential integrity. No ML model is added in this plan.

---

## Phase 1 — Feature Snapshot Storage

**Schema change** (migration):
- `predictions.feature_snapshot JSONB`
- `predictions.training_only BOOLEAN NOT NULL DEFAULT false`
- Index: `CREATE INDEX idx_predictions_training_only ON predictions(training_only) WHERE training_only = false;`

**Code change** in `supabase/functions/generate-statistical-prediction/index.ts`:
Build the snapshot just before the DB upsert and write it alongside the prediction.

```ts
const feature_snapshot = {
  lambda_home, lambda_away,
  base_lambda_home, base_lambda_away,            // pre-adjustment
  poisson_home_prob, poisson_draw_prob, poisson_away_prob,
  league: match.league,
  league_reliability: leagueRelFactor,
  league_position_home, league_position_away, position_diff,
  form_home: features?.home_form_last5,
  form_away: features?.away_form_last5,
  home_avg_scored, home_avg_conceded,
  away_avg_scored, away_avg_conceded,
  h2h: { home_wins, draws, away_wins },
  volatility: volatilityScore,
  match_importance, match_stage, competition_type,
  bookmaker_probs: odds ? { home: implied_home, draw: implied_draw, away: implied_away } : null,
  market_agreement,
  enrichment_flags: {
    key_player_missing_home, key_player_missing_away,
    news_sentiment_home, news_sentiment_away,
    weather_impact, lineup_confirmed,
  },
  intelligence: { confidence_adjustment, momentum_home, momentum_away },
  data_quality, quality_score,
  model_version: latestModelVersion,
  applied_weights: { home_bias, draw_calibration, league_lambda_shift_home, league_lambda_shift_away, confidence_deflator },
  generated_at: new Date().toISOString(),
};
```

Deploy: `generate-statistical-prediction`.

---

## Phase 2 — Backfill Historical Predictions

New edge function: `backfill-training-predictions`.

Behavior:
- Iterates `matches` where `status = 'completed'` AND no `predictions` row exists OR existing prediction lacks `feature_snapshot`.
- Calls the same statistical pipeline with a `training_mode: true` flag so the engine:
  - skips publish-status logic
  - sets `training_only = true`
  - sets `publish_status = 'training_only'` (extend the column's allowed values implicitly — it's free text)
  - uses only data that existed at the time (point-in-time integrity is best-effort: completed match snapshot is acceptable since features are reconstructed from `team_statistics` + historical `matches`)
- Batches of 25 matches per invocation, 250 ms delay between calls, idempotent (UPSERT keyed by `match_id` only when prediction missing).
- Resumable via `?cursor=<match_date>` query param.

Frontend filter: `useMatches` and any prediction lists must filter `training_only = false` (already filtering `low_quality`, extend the same hook).

Trigger: manual run from Accuracy dashboard "Backfill" button → invokes function in a loop until cursor exhausted. Target ≥ 2,000 backfilled rows (4,053 completed matches available).

---

## Phase 3 — Odds Coverage Improvement

Audit & re-ingest:
- New edge function `backfill-odds`:
  - Selects `matches` (completed + upcoming next 14 days) where no row in `odds` exists.
  - Calls API-Football `odds` endpoint in batches of 20 fixture IDs.
  - Inserts `home_win_odds`, `draw_odds`, `away_win_odds` (Bet365 → fallback first available bookmaker).
  - Rate-limited: 10 req/sec, respects API-Football quota.
- Update `auto-sync` to call `backfill-odds` for newly synced upcoming matches automatically.
- Add a coverage check in `compute-model-performance` validation_metrics: `odds_coverage_pct`.

Target: raise current 12% → ≥ 80% on the published prediction set.

---

## Phase 4 — Data Integrity (Foreign Keys)

Migration:

```sql
-- Clean orphans first
DELETE FROM predictions WHERE match_id NOT IN (SELECT id FROM matches);
DELETE FROM match_features WHERE match_id NOT IN (SELECT id FROM matches);
DELETE FROM prediction_reviews WHERE match_id NOT IN (SELECT id FROM matches);

-- Add prediction_id to prediction_reviews if missing
ALTER TABLE prediction_reviews
  ADD COLUMN IF NOT EXISTS prediction_id uuid;

UPDATE prediction_reviews pr
   SET prediction_id = p.id
  FROM predictions p
 WHERE p.match_id = pr.match_id
   AND pr.prediction_id IS NULL;

-- Foreign keys
ALTER TABLE predictions
  ADD CONSTRAINT predictions_match_id_fkey
  FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE;

ALTER TABLE match_features
  ADD CONSTRAINT match_features_match_id_fkey
  FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE;

ALTER TABLE prediction_reviews
  ADD CONSTRAINT prediction_reviews_prediction_id_fkey
  FOREIGN KEY (prediction_id) REFERENCES predictions(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_predictions_match_id ON predictions(match_id);
CREATE INDEX IF NOT EXISTS idx_match_features_match_id ON match_features(match_id);
CREATE INDEX IF NOT EXISTS idx_prediction_reviews_prediction_id ON prediction_reviews(prediction_id);
```

Update `batch-review-matches` to set `prediction_id` on every new review row.

---

## Phase 5 — Dataset Validation

New edge function `dataset-validation-report` returns JSON:

```json
{
  "total_predictions": ...,
  "training_only": ...,
  "published": ...,
  "with_feature_snapshot_pct": ...,
  "odds_coverage_pct": ...,
  "match_features_coverage_pct": ...,
  "match_enrichment_coverage_pct": ...,
  "match_intelligence_coverage_pct": ...,
  "review_coverage_pct": ...,
  "orphan_rows": { "predictions": 0, "match_features": 0, "prediction_reviews": 0 },
  "usable_training_samples": ...,
  "missing_fields_top10": [...]
}
```

UI: new "ML Readiness" panel on `/accuracy` showing each metric with a green/amber/red status against the success thresholds.

---

## Success Criteria (verified post-implementation)
- 100% of new predictions write `feature_snapshot`.
- ≥ 2,000 rows in `predictions` with `feature_snapshot IS NOT NULL`.
- `odds_coverage_pct` ≥ 80% on published predictions.
- All three FK constraints exist; `orphan_rows` all zero.
- Accuracy dashboard "ML Readiness" panel renders all-green.

---

## Files & artifacts to create / edit

**New migrations**
- `add_feature_snapshot_and_training_flag.sql`
- `add_predictions_match_features_reviews_fks.sql`

**New edge functions**
- `supabase/functions/backfill-training-predictions/index.ts`
- `supabase/functions/backfill-odds/index.ts`
- `supabase/functions/dataset-validation-report/index.ts`

**Edited edge functions**
- `supabase/functions/generate-statistical-prediction/index.ts` (snapshot writer + training_mode branch)
- `supabase/functions/batch-review-matches/index.ts` (set `prediction_id`)
- `supabase/functions/auto-sync/index.ts` (chain `backfill-odds` for new upcoming)

**Edited frontend**
- `src/hooks/useMatches.ts` (filter `training_only`)
- `src/integrations/supabase/types.ts` (auto-regenerated)
- `src/hooks/useModelPerformance.ts` (expose readiness metrics)
- `src/pages/Accuracy.tsx` (ML Readiness panel + Backfill trigger button)

---

## Execution order
1. Migrations (Phase 1 schema + Phase 4 FKs).
2. Update `generate-statistical-prediction` to write snapshots.
3. Build & run `backfill-training-predictions` until ≥ 2,000 rows.
4. Build & run `backfill-odds`; wire into `auto-sync`.
5. Build `dataset-validation-report` + Accuracy dashboard panel.
6. Final verification report against success criteria.

