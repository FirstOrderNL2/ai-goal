# GoalGPT Learning System — Phased Implementation Plan

Turn GoalGPT from a heuristic + LLM prototype into a true stateful learning system: immutable predictions, post-match online updates, point-in-time correctness, batch retraining with a model registry, and the LLM demoted to an explanation-only layer.

Current state baseline (from the live DB):
- 2,457 predictions, only 189 have a `pre_match_snapshot`, 1,800 are `training_only`.
- 2,243 reviews, ~47.5% outcome accuracy.
- Phase 0 leakage fixes already shipped (cutoff filtering, no fallback writes, post-kickoff guards). This plan continues from there.

---

## Phase 1 — Immutable prediction runs (foundation)

Goal: Every prediction the model emits becomes an append-only record. `predictions` becomes a serving projection only.

### Schema (migration)
- New table `prediction_runs` (append-only, immutable):
  - `id`, `match_id`, `run_type` (`pre_match` | `t_minus_60` | `t_minus_15` | `halftime` | `live`),
  - `created_at`, `prediction_cutoff_ts`,
  - `model_version`, `feature_version`, `artifact_version`,
  - `feature_snapshot jsonb`, `probabilities jsonb` (1X2/BTTS/OU), `expected_goals jsonb`, `score_distribution jsonb`,
  - `publish_status`, `training_only bool`,
  - Unique index on `(match_id, run_type, model_version)`.
- New table `match_labels` (truth, written once at completion):
  - `match_id` PK, `goals_home`, `goals_away`, `outcome`, `btts`, `over_05/15/25/35`, `finalized_at`.
- Add `current_run_id uuid` to `predictions` to point to the latest serving run.

### Code changes
- `generate-statistical-prediction`: after computing, write a new row to `prediction_runs` (never UPDATE) and upsert `predictions` as a projection of the latest run.
- `generate-ai-prediction`: read probabilities from `prediction_runs`, write only `ai_reasoning`/explanation onto `predictions`. Hard guard: cannot mutate probability columns.
- `pre-match-predictions` and `nightly-prediction-reconcile`: emit run rows, not in-place updates.
- All training/review readers switch source-of-truth to `prediction_runs` joined to `match_labels`.

### Done when
- Every published prediction in the last 24h has a matching immutable `prediction_runs` row.
- No UPDATEs to probability columns on `predictions` after kickoff (verified via `prediction_logs`).

---

## Phase 2 — Online learning state (true post-match learning)

Goal: Every completed match instantly updates team strength + calibration state.

### Schema
- `team_rating_history`: `team_id`, `match_id`, `league`, `rating_winloss_before/after`, `attack_before/after`, `defense_before/after`, `home_adv_context`, `updated_at`. Indexed by `(team_id, updated_at desc)`.
- `calibration_events`: `prediction_run_id`, `market` (`1x2`/`btts`/`ou25`/...), `predicted_probability`, `actual_outcome bool`, `league`, `bucket`, `created_at`.

### New edge functions
- `finalize-match-label`: triggered when a match flips to `completed`. Writes `match_labels`, derives outcome flags.
- `update-online-ratings`: implements Elo/Glicko + Dixon-Coles attack/defense decay per league. Writes `team_rating_history`. Idempotent per `match_id`.
- `append-calibration-events`: emits one row per market for the matching pre-match `prediction_run`.

### Wiring
- `auto-sync` (existing match-status flip) calls these three in order. `batch-review-matches` keeps building human-readable reviews but no longer carries the learning weight.

### Done when
- Every newly completed match produces: 1 `match_labels` row, ≥2 `team_rating_history` rows, ≥3 `calibration_events` rows — within minutes of FT.
- Inference (`generate-statistical-prediction`) reads the latest team rating snapshot at `as_of` instead of recomputing rolling averages from raw matches.

---

## Phase 3 — Offline training pipeline

Goal: Reproducible challenger training from immutable runs + labels.

### Schema
- `training_examples` (append-only): `prediction_run_id`, `match_id`, `feature_snapshot`, `label_snapshot`, `model_family`, `dataset_version`, `created_at`.
- `training_jobs`: job metadata, status, metrics, dataset_version, started/finished.

### Edge functions
- `append-training-example`: called after `finalize-match-label`, joins the pre-match run + label.
- `maybe-trigger-retraining`: cron + threshold (≥50 new labels OR nightly OR drift alert). Enqueues a `training_jobs` row.
- `train-challenger-model`: reads `training_examples` with strict time-based split, fits a residual gradient-boosted model on top of the Poisson/Elo baseline. Runs in an edge function using a JS GBDT (e.g. `npm:ml-cart`/`npm:lightgbm-js` if viable) — if not, this becomes a scheduled job that POSTs to an external worker; the registry/metrics path stays the same.
- `evaluate-challenger-model`: log loss, Brier, RPS, ECE, MAE-goals on a held-out time window.

### Done when
- One command (or one cron tick) builds a dataset, trains a challenger, and writes a metrics report to `training_jobs`.
- Splits are strictly temporal; integration test confirms no `match_date >= cutoff` rows in the train fold.

---

## Phase 4 — Model registry & promotion

Goal: Versioned artifacts, explicit champion/challenger, safe rollback.

### Schema
- `model_registry`: `model_version`, `model_family`, `artifact_path`, `feature_version`, `train_window_start/end`, `holdout_window_start/end`, `metrics_json`, `status` (`training`/`challenger`/`champion`/`archived`), `created_at`, `promoted_at`.
- `model_artifacts`: blob storage refs (Supabase Storage bucket `model-artifacts`, private).
- `feature_registry`: tracks feature schema versions and their builders.

### Edge functions
- `promote-model`: gate — challenger must beat champion on log loss AND Brier AND not regress calibration ECE > 1pp. Updates `status`, sets `promoted_at`.
- `rollback-model`: flips champion back to a previous `model_version`.
- `generate-statistical-prediction` loads the current champion artifact at request time (cached).

### Done when
- Every served prediction stamps the `model_version` it came from.
- Rollback is a single function call that takes effect on the next inference.

---

## Phase 5 — LLM cleanup (explanation-only)

Goal: LLM cannot influence probabilities.

### Changes
- `generate-ai-prediction` and `football-intelligence`: refactored signatures take `probabilities`, `expected_goals`, `score_distribution` as inputs and return only text fields (`ai_reasoning`, `match_narrative`, caveats). Server-side guard rejects writes to numeric prediction columns.
- Confidence computation moves entirely into the statistical layer (Confidence Engine V2 already exists — keep it numeric-only).
- Add a feature flag `LLM_EXPLANATIONS_ENABLED`. With it off, the system still serves complete predictions.

### Done when
- Disabling the LLM does not change a single probability in `prediction_runs`.
- Diff of `predictions` numeric columns before/after AI step is always zero.

---

## Cross-cutting: monitoring & guardrails

- New view `v_learning_health` aggregating: % matches with immutable pre-match run, % with calibration events written, ratings-update lag, retrain cadence, champion vs challenger metric gap.
- Extend `coverage-alert` to alert on:
  - matches completed >30m without `match_labels`,
  - `prediction_runs` written after kickoff,
  - calibration ECE drift per league > threshold,
  - promotion happened without holdout metrics row.
- Admin-only gate (reuse `is-admin.ts`) on: `train-challenger-model`, `promote-model`, `rollback-model`, `maybe-trigger-retraining`.

---

## Suggested execution order (sprints)

1. **Sprint 1 (Phase 1):** `prediction_runs` + `match_labels` migration; refactor `generate-statistical-prediction` & `generate-ai-prediction`; switch readers.
2. **Sprint 2 (Phase 2):** `team_rating_history` + `calibration_events`; `finalize-match-label`, `update-online-ratings`, `append-calibration-events`; wire into `auto-sync`.
3. **Sprint 3 (Phase 3):** `training_examples`, `training_jobs`; trainer + evaluator functions; nightly cron.
4. **Sprint 4 (Phase 4):** `model_registry`, artifact storage, promote/rollback; inference loads champion artifact.
5. **Sprint 5 (Phase 5):** LLM probability lock; feature flag; monitoring views and alerts.

Each sprint ships independently and leaves the system in a working state.

---

## Definition of done (system level)

- Every finished match → `match_labels` row + `team_rating_history` updates + `calibration_events` within minutes.
- Every served prediction → an immutable `prediction_runs` row with `model_version` + `feature_version`.
- Retraining is reproducible from snapshots; promotion gated on log loss + Brier + calibration.
- LLM off ⇒ probabilities unchanged.
- `v_learning_health` shows a non-zero, improving champion-vs-previous gap over time.

## Out of scope (explicit)

- Building a full external ML training cluster — Phase 3 trainer runs as an edge function or scheduled worker; heavier infra is a follow-up if metrics demand it.
- Replacing API-Football as the data source.
- Public-facing UI changes beyond exposing model_version on prediction cards (optional).
