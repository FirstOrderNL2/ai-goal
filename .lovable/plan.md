# Phase 3.5 readiness check + Phase 4 (model registry & promotion) + Phase 5 hooks

## Phase 3.5 — Readiness check (BLOCKER FOUND)

I just ran the readiness query against the live DB. The pipeline is **NOT** feeding itself. Root cause identified:

```
total_predictions:       2,457
predictions in last 24h: 17
predictions with current_run_id: 0
prediction_runs total:   0          ← BUG
labeled_pre_match_runs:  0
calibration_events:      0
training_examples:       0
```

`generate-statistical-prediction` **fails to boot**:
```
SyntaxError: Identifier 'matchDateIso' has already been declared at index.ts:803
```
The Phase 1 patch added a second `const matchDateIso` that collides with the one declared at line 238. Every prediction since deploy has been served by a fallback path or stale data, so no `prediction_runs` row was ever written.

### Fix (immediate, Phase 3.5)
1. Rename the colliding local in `generate-statistical-prediction/index.ts` (`matchDateIso` → `runMatchDateIso` at lines 802–807).
2. Verify `generate-ai-prediction` for the same collision.
3. Trigger one prediction → confirm a `prediction_runs` row is written, `predictions.current_run_id` is set.
4. Trigger `pre-match-predictions` to backfill upcoming matches → expect `pre_match_runs > 0`.

### Readiness dashboard
Add a single admin-only page **`/admin/learning-pipeline`** (gated by existing `is-admin.ts`) that shows live counts, refreshing every 30s:

| Metric | Source |
|---|---|
| Pre-match prediction_runs (total / 24h / 7d) | `prediction_runs WHERE run_type='pre_match'` |
| Distinct matches with pre-match run | `count(DISTINCT match_id)` |
| Match labels (total / 7d) | `match_labels` |
| **Labeled pre-match runs** (the join that matters) | `prediction_runs ⨝ match_labels` |
| Calibration events (per market breakdown) | `calibration_events` |
| Training examples (by dataset_version) | `training_examples` |
| Training jobs (queued / running / succeeded / failed) | `training_jobs` |
| Last 5 training jobs with metrics + decision | `training_jobs ORDER BY created_at DESC LIMIT 5` |

Plus a **shadow-mode banner** at the top: "Training in shadow mode — promotion blocked until ≥ 200 labeled pre-match runs (currently: N)". The 200-row gate is enforced server-side in `train-challenger-model` (see Phase 4).

### Shadow-mode gate (training plumbing only, no model promotion)
Update `train-challenger-model`:
- Continue producing metrics and `decision` for visibility.
- But override `decision='keep_champion'` and add `notes: 'shadow_mode: <N> < 200 labeled examples'` whenever `n_train + n_val + n_holdout < 200`.
- Once volume is ≥ 200, the real promotion gate (Phase 4) takes over.

---

## Phase 4 — Model registry & controlled promotion

### Schema (one migration)

**`model_registry`** — one row per logical model (a "champion slot" per family).
- `id uuid pk`, `model_family text` (e.g. `1x2_baseline`), `champion_artifact_id uuid` (nullable; FK conceptually to `model_artifacts`), `updated_at timestamptz`.
- Unique on `model_family`. Public read; writes service-role only.

**`model_artifacts`** — every trained model, immutable.
- `id`, `model_family`, `feature_version`, `dataset_version`, `hyperparameters jsonb`, `weights jsonb` (full model state — for the JS logreg this is `{W, b, feature_keys, calibrator}`), `train_window_start/end`, `validation_window_start/end`, `holdout_window_start/end`, `n_train/n_val/n_holdout`, `metrics_json jsonb` (multi-window: overall, recent_holdout, per_top_league), `created_at`, `created_by_job_id` (FK conceptually to `training_jobs`), `status text` (`shadow` | `champion` | `archived` | `rolled_back`), `promoted_at`, `rolled_back_at`, `notes`.
- Index on `(model_family, status, created_at DESC)`. Public read; writes service-role only.

**`evaluation_runs`** — every champion-vs-challenger comparison, one per (artifact, window).
- `id`, `artifact_id`, `champion_artifact_id` (nullable for first-ever model), `window_start`, `window_end`, `n_examples`, `metrics_challenger jsonb`, `metrics_champion jsonb`, `per_league_json jsonb`, `passes_gate boolean`, `gate_reasons jsonb`, `created_at`.
- Index on `(artifact_id, created_at DESC)`. Public read; writes service-role only.

### Edge functions (all admin-only — JWT verified + `is-admin` check)

1. **`train-challenger-model`** (Phase 3, upgraded)
   - On success, **insert `model_artifacts` row with `status='shadow'`**, link to job via `created_by_job_id`.
   - Persist real model weights (`W`, `b`, `feature_keys`) so we can serve it.
   - Compute metrics on three windows: full holdout, recent_holdout (last 25%), per-league for top-5 leagues by volume.
   - Insert `evaluation_runs` row vs current champion (if any).

2. **`evaluate-artifact`** — replays an artifact against any window of `training_examples`. Used for ongoing shadow comparisons. Writes a new `evaluation_runs` row.

3. **`promote-model`** — admin-triggered. Validates **hard promotion gates** before promoting:
   - **Volume**: ≥ 200 labeled pre-match examples in holdout.
   - **Beats champion overall** on: log_loss, brier, rps, ece (challenger ≤ champion + 1pp), mae_goals.
   - **Beats champion on most recent holdout window** (last 25% slice) on log_loss + brier.
   - **No major-league collapse**: for each top-5 league with ≥ 30 examples, challenger log_loss must not be > 5% worse than champion.
   - If all pass → set `model_artifacts.status='champion'`, demote previous champion to `archived`, update `model_registry.champion_artifact_id`, stamp `promoted_at`.
   - If any fail → return per-gate `reasons` array, leave artifact in `shadow`.

4. **`rollback-model`** — admin-triggered with `target_artifact_id`. Validates target was a previous champion of same family, sets it back to `champion`, current champion to `rolled_back`, updates registry.

5. **`shadow-evaluate-recent`** — runs nightly via cron. For each `shadow` artifact, evaluates on the last 7 days of new `training_examples`, writes `evaluation_runs`. This is how we accumulate evidence over time without promoting.

### Inference path (unchanged for production)
- **Production `generate-statistical-prediction` continues to serve the existing baseline.** No artifact loading on the public path.
- New helper `_shared/serve-challenger.ts` is added but called only by an admin batch job (`run-shadow-predictions`) that:
  - Reads new `prediction_runs` (pre_match) for upcoming matches,
  - Loads each `shadow` artifact's weights,
  - Computes shadow probabilities and writes them to a new table **`shadow_predictions`** (`run_id`, `artifact_id`, `probabilities`, `created_at`),
  - This table feeds future `evaluation_runs` once labels arrive — but is never read by the public app.

### Shadow predictions schema
**`shadow_predictions`** — `id`, `prediction_run_id`, `artifact_id`, `probabilities jsonb`, `expected_goals jsonb`, `created_at`. Unique on `(prediction_run_id, artifact_id)` so reruns are idempotent. Public read; service-role write.

### Admin UI additions
- `/admin/models` — lists `model_registry` + `model_artifacts` with status badges, metrics, promote/rollback buttons (gated to admins).
- `/admin/learning-pipeline` — the readiness dashboard from 3.5.

---

## Phase 5 — Cleanup & guardrails (delivered alongside Phase 4)

1. **LLM stays explanation-only forever** — already enforced; add an integration test `tests/llm-no-numeric-mutation.test.ts` that calls `generate-ai-prediction` and asserts `predictions.home_win/draw/away_win/expected_goals_*` are byte-identical before vs after.

2. **Split admin from public**:
   - All Phase 2/3/4 admin functions get `verify_jwt = true` in `supabase/config.toml` AND a server-side `requireAdmin()` check using the existing `is-admin.ts` pattern.
   - List of admin-only functions: `update-online-ratings`, `append-calibration-events`, `append-training-example`, `maybe-trigger-retraining`, `train-challenger-model`, `evaluate-challenger-model`, `evaluate-artifact`, `promote-model`, `rollback-model`, `shadow-evaluate-recent`, `run-shadow-predictions`.
   - `auto-sync` keeps service-role auth for cron.
   - Public inference functions (`generate-statistical-prediction`, `generate-ai-prediction`, `pre-match-predictions`) are unchanged.

3. **Monitoring / alerts** — new edge function `pipeline-health-check` runs every 15 min via cron, writes a row to a new **`pipeline_health`** table when any of these fire, AND sends a Slack/email alert if the user has the secret configured (we'll detect available secrets first):
   - **No new pre-match runs in last 6 hours** while there are upcoming matches in next 24h.
   - **No new match_labels in last 12 hours** while there are completed matches.
   - **Failed training jobs > 0 in last 24 hours**.
   - **Calibration drift**: ECE in last 7 days vs prior 30 days drifts > 5pp.
   - **Shadow artifact has 0 evaluation_runs > 48 hours old** (meaning shadow-evaluate cron isn't running).

   `pipeline_health` table: `id`, `check_type`, `severity` (info/warn/error), `message`, `details jsonb`, `created_at`, `acknowledged_at`. Surfaced in the readiness dashboard.

---

## Files this will create / touch

**Migration (1 file)** — `model_registry`, `model_artifacts`, `evaluation_runs`, `shadow_predictions`, `pipeline_health` + RLS.

**New edge functions** (all admin-gated):
- `evaluate-artifact`
- `promote-model`
- `rollback-model`
- `shadow-evaluate-recent`
- `run-shadow-predictions`
- `pipeline-health-check`

**Edited edge functions**:
- `generate-statistical-prediction` — fix `matchDateIso` collision (Phase 3.5 unblock).
- `generate-ai-prediction` — defensive check for same collision.
- `train-challenger-model` — write `model_artifacts` row with weights, multi-window metrics, shadow-mode gate (< 200), insert `evaluation_runs`.
- `auto-sync` — add `pipeline-health-check` to idle/full chain.

**New helpers**:
- `supabase/functions/_shared/admin-auth.ts` — `requireAdmin(req)` returning user or 401/403.
- `supabase/functions/_shared/serve-challenger.ts` — load artifact weights and compute probs.
- `supabase/functions/_shared/promotion-gates.ts` — pure functions for each gate.

**New UI**:
- `src/pages/admin/LearningPipeline.tsx` — readiness dashboard (admin-only).
- `src/pages/admin/Models.tsx` — registry + promote/rollback (admin-only).
- Routes added to `src/App.tsx` behind admin guard.

**Cron**:
- `shadow-evaluate-recent` — nightly at 03:00 UTC.
- `pipeline-health-check` — every 15 min.

---

## Done when

- `prediction_runs` grows on every new prediction (Phase 3.5 unblock proven).
- Readiness dashboard renders with non-zero counts within one auto-sync cycle.
- A `shadow` artifact appears in `/admin/models` after the next training job.
- `promote-model` returns explicit gate failures while volume < 200, then promotes once gates pass on real data.
- `pipeline-health-check` rows appear when we deliberately stop a cron (manual smoke test).
- LLM-no-mutation test passes.

Approve and I'll ship Phase 3.5 fix + Phase 4 + Phase 5 in one go.
