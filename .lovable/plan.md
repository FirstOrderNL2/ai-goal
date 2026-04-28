# Phase 2.5 (current-state) + Phase 3 (offline training)

Both phases ship together in one approval. Both confirmations baked in:

- **Confirmation 1**: `append-calibration-events` already filters `run_type='pre_match'`. We add a defensive assertion so any future change can't accidentally widen it.
- **Confirmation 2**: The dataset builder uses `prediction_runs.prediction_cutoff_ts` as the only `as_of` source. Every team-rating, feature, and label query is gated on it.

---

## Phase 2.5 — Latest serving snapshot

### Schema (migration)

- **`team_rating_state`** (PK `team_id`):
  `league`, `rating_winloss`, `attack`, `defense`, `matches_counted`, `last_match_id`, `last_match_at`, `updated_at`. Public read; writes service-role only.
- **Backfill**: populate from existing `team_rating_history` (latest row per team) so the 600 rows already produced light it up immediately.

### Code

- **New helper** `supabase/functions/_shared/ratings.ts`:
  - `getCurrentRatings(supabase, teamIds)` → reads `team_rating_state` (fast serving path).
  - `getRatingsAsOf(supabase, teamIds, asOfIso)` → reads `team_rating_history` strictly before `asOfIso` (point-in-time path, used by the dataset builder).
  - `eloProbabilities`, `ratingExpectedGoals` — pure math.

- **`update-online-ratings` change**: after each `team_rating_history` upsert, **also upsert `team_rating_state`** for both teams using a "newer-wins" guard (`EXCLUDED.last_match_at >= team_rating_state.last_match_at`). This is application-level rather than a DB trigger so it stays portable and easy to test.

- **`generate-statistical-prediction` change**: read both teams' current ratings at the top, store them in `feature_snapshot.team_ratings.{home,away}` so the immutable run carries the exact strengths used. No probability change yet — Phase 4 is what consumes them in inference.

### Tests (Deno)

`supabase/functions/update-online-ratings/index_test.ts` — talks to the live edge function via fetch using `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` from `.env`:

1. **Run-once correctness**: invoke once, snapshot `team_rating_state` rows for a sample team, assert `rating_winloss` matches the latest `team_rating_history.rating_winloss_after`.
2. **Idempotency**: invoke a second time with the same window. Assert:
   - row count of `team_rating_history` is unchanged (unique on `team_id+match_id`),
   - `team_rating_state.rating_winloss` is **bit-identical** to the first run for every sampled team (no drift),
   - `team_rating_state.matches_counted` is unchanged.
3. **Newer-wins guard**: write a synthetic out-of-order history row with an older `updated_at`; assert `team_rating_state` does NOT regress.

### Done when

- `team_rating_state` row count ≈ distinct teams in `team_rating_history`.
- All three tests pass.

---

## Phase 3 — Offline training pipeline

### Schema (same migration as 2.5)

- **`training_examples`** (append-only):
  `prediction_run_id`, `match_id`, `prediction_cutoff_ts`, `feature_snapshot jsonb`, `label_snapshot jsonb`, `model_family`, `dataset_version`, `league`. Unique on `(prediction_run_id, model_family, dataset_version)`.
- **`training_jobs`**:
  `model_family`, `dataset_version`, `train_window_start/end`, `holdout_window_start/end`, `n_train`, `n_holdout`, `status` (`queued`/`running`/`succeeded`/`failed`), `metrics_json`, `champion_metrics_json`, `decision` (`promote`/`keep_champion`), `error`, `started_at`, `finished_at`. Public read; service-role write.

### New helpers

- `supabase/functions/_shared/metrics.ts` — pure functions: `multiclassLogLoss`, `brier1x2`, `rankedProbabilityScore`, `expectedCalibrationError`, `maeGoals`, `accuracy1x2`.
- `supabase/functions/_shared/dataset.ts` — `buildPointInTimeDataset({ cutoffStart, cutoffEnd, datasetVersion })`:
  1. Pulls `prediction_runs` with `run_type='pre_match'` AND `prediction_cutoff_ts` between `cutoffStart..cutoffEnd`.
  2. Joins on `match_labels` (only labeled matches qualify).
  3. For each row, calls `getRatingsAsOf(supabase, [home, away], run.prediction_cutoff_ts)` — strict `< cutoff` filter prevents leakage.
  4. Returns rows with: features `{ poisson_home, poisson_draw, poisson_away, xg_home, xg_away, elo_home, elo_away, elo_gap, atk_home, def_home, atk_away, def_away }` and labels `{ outcome, goals_home, goals_away, btts, over_25 }`.

### New edge functions

1. **`append-training-example`** — uses `buildPointInTimeDataset` for "all newly-labeled examples we don't yet have", upserts into `training_examples`. Idempotent. Wired into `auto-sync` after Phase 2's calibration step.

2. **`maybe-trigger-retraining`** — checks: ≥50 new training examples since last `training_jobs.status='succeeded'`, OR nightly window, OR ECE drift > 5pp. Enqueues a `training_jobs` row with `status='queued'`.

3. **`train-challenger-model`** — runs in-edge (180s cap, 5000-row cap):
   - Builds the dataset window from `training_examples` only (already point-in-time correct).
   - **Time-based 60/20/20 split**: train (oldest 60%) / val (middle 20%) / holdout (most recent 20%). No randomization.
   - **Baseline model** (champion proxy until Phase 4): the existing Poisson probabilities already in `feature_snapshot`.
   - **Challenger model**: lightweight residual logistic regressor (mini-batch SGD in pure JS) over `[poisson_home, poisson_draw, poisson_away, xg_home, xg_away, elo_gap, atk_home, def_home, atk_away, def_away]` → emits 3-way 1X2 probs. Hyperparams tuned on val.
   - **Calibration**: 10-bin isotonic-style remap fit on val, applied to holdout.
   - Computes on **holdout only**: log loss, Brier, RPS, ECE, MAE goals, accuracy.
   - Writes `metrics_json` (challenger), `champion_metrics_json` (baseline), `decision`.
   - **Promotion gate (this phase ships the gate but not the artifact registry)**: `decision='promote'` only if challenger beats champion on log loss AND Brier AND ECE doesn't regress > 1pp. Otherwise `decision='keep_champion'`. **No model artifact is persisted yet** — Phase 4 owns artifact storage and inference loading. So this phase produces decisions but production keeps serving the current Poisson + ratings baseline.

4. **`evaluate-challenger-model`** — replays a `training_jobs` model against any window, returns the same metric set. Useful for replay/regression testing.

### Wiring

- `auto-sync` (full + idle modes), after the existing Phase 2 chain:
  ```
  append-training-example → maybe-trigger-retraining
  ```
- `train-challenger-model` runs only when explicitly invoked (admin trigger, or a cron once we add it). Not on every sync.

### Defensive guards

- `append-calibration-events`: confirm filter is `run_type='pre_match'` (already true). Add an explicit assertion + log line so it can't silently widen.
- Dataset builder: hard assert `run_type='pre_match'` AND `prediction_cutoff_ts <= match_date`. Skip & log any row that fails.
- `train-challenger-model`: assert `holdout_window_start > train_window_end` and `min(holdout.created_at) > max(train.created_at)`. Refuse to run otherwise.

### Tests (Deno)

- `_shared/metrics_test.ts` — unit tests on toy 1X2 vectors (perfect prediction → log loss ≈ 0; uniform → log loss ≈ ln 3; ECE 0 for perfectly calibrated; etc.).
- `append-training-example/index_test.ts` — invoke twice; assert no duplicate rows (unique constraint), and assert dataset rows match the expected joined count from `prediction_runs ⨝ match_labels`.
- `train-challenger-model/index_test.ts` — invoke with a fixed window; assert `metrics_json.holdout` contains the five required fields, and assert `decision` ∈ `{'promote', 'keep_champion'}`.

### Done when

- Newly-labeled match → 1 row in `training_examples`.
- `maybe-trigger-retraining` produces `training_jobs` rows once threshold is met.
- A `training_jobs` row contains `metrics_json.holdout = { log_loss, brier, rps, ece, mae_goals, accuracy }` plus `champion_metrics_json` and `decision`.
- All Deno tests pass.

---

## Files this will create / touch

**Migration (1 file):**
- `team_rating_state` + RLS + backfill
- `training_examples` + RLS + unique index
- `training_jobs` + RLS

**New helpers:**
- `supabase/functions/_shared/ratings.ts`
- `supabase/functions/_shared/metrics.ts`
- `supabase/functions/_shared/dataset.ts`

**New edge functions:**
- `supabase/functions/append-training-example/index.ts`
- `supabase/functions/maybe-trigger-retraining/index.ts`
- `supabase/functions/train-challenger-model/index.ts`
- `supabase/functions/evaluate-challenger-model/index.ts`

**Edits:**
- `supabase/functions/update-online-ratings/index.ts` (also upsert `team_rating_state`)
- `supabase/functions/generate-statistical-prediction/index.ts` (snapshot team ratings into `feature_snapshot`)
- `supabase/functions/auto-sync/index.ts` (add training chain after calibration)
- `supabase/functions/append-calibration-events/index.ts` (defensive assertion on `run_type`)

**Tests:**
- `supabase/functions/update-online-ratings/index_test.ts`
- `supabase/functions/_shared/metrics_test.ts`
- `supabase/functions/append-training-example/index_test.ts`
- `supabase/functions/train-challenger-model/index_test.ts`

---

## Out of scope (Phase 4)

- Model artifact storage / `model_registry`.
- Inference loading the challenger artifact.
- Rollback flow.

Approve and I'll ship 2.5 + 3 in one go on the next turn.
