# Phase 4.5 — Automate & Observe the Learning Loop

Goal: make the loop run by itself, expose it through an admin UI, and watch it for ~1–2 weeks. **No model is promoted to production by this phase.** We only enable shadow comparison and human-triggered promotion.

---

## 1. Wire the missing scheduled jobs (pg_cron)

All schedules in Europe/Berlin-friendly UTC slots. Each job uses `net.http_post` with the anon key (matches existing pattern). Inserted via the insert tool (not migrations) since they contain project URLs/keys.

| Job | Schedule (UTC) | Function | Body |
|---|---|---|---|
| `learning-maybe-retrain-nightly` | `15 2 * * *` | `maybe-trigger-retraining` | `{}` |
| `learning-train-challenger-nightly` | `30 2 * * *` | `train-challenger-model` | `{"trigger":"cron"}` |
| `learning-shadow-evaluate-nightly` | `45 2 * * *` | `evaluate-challenger-model` | `{"window":"7d"}` |
| `learning-run-shadow-predictions-10m` | `*/10 * * * *` | `run-shadow-predictions` (new) | `{"limit":200}` |
| `learning-pipeline-health-hourly` | `0 * * * *` | `pipeline-health-check` | `{}` |

Order matters: `maybe-trigger-retraining` first (queues a job if needed), then `train-challenger-model` consumes the queued job, then `evaluate-challenger-model` runs gates on the produced artifact.

## 2. Finish shadow mode end-to-end

**New function `run-shadow-predictions`** (admin/service-role only):

- Selects `prediction_runs` where `run_type='pre_match'` from the last N days that do **not** yet have a row in `shadow_predictions` for each currently `status='shadow'` artifact in `model_artifacts`.
- For each (run, artifact) pair:
  - Loads weights from `model_artifacts.weights` and the immutable `feature_snapshot` from the `prediction_runs` row (no recomputation, no leakage).
  - Computes shadow probabilities/expected goals using the same Poisson + logistic head as `train-challenger-model` evaluation.
  - Inserts into `shadow_predictions` with `(prediction_run_id, artifact_id)` as the idempotency key.
- Production `predictions` and `prediction_runs` are untouched. The public app keeps serving the baseline.

**Schema tweak (migration):** add `UNIQUE (prediction_run_id, artifact_id)` on `shadow_predictions` so the cron is safely re-runnable.

**Evaluation wiring:** update `evaluate-challenger-model` so when labels arrive for a match, it joins `shadow_predictions` × `match_labels` to populate `evaluation_runs.metrics_challenger` and compares against the champion's metrics on the same matches → `metrics_champion`. Gate decision is recorded but **never auto-promotes**.

## 3. Admin UI: `/admin/models`

- New route `/:lang/admin/models` behind `ProtectedRoute` + a new `AdminRoute` wrapper that checks `ADMIN_USER_IDS` (env-driven allow-list, mirrored client-side via a small `is-admin` edge function).
- Page sections:
  - **Champion** card per `model_family` (from `model_registry` → `model_artifacts`): version, promoted_at, n_train/val/holdout, headline metrics.
  - **Shadow artifacts** table: created_at, n shadow predictions so far, latest `evaluation_runs` metrics vs champion, gate result (pass/fail) with `gate_reasons`.
  - **Archived / rolled-back** artifacts list.
  - **Actions** (admin-only): `Promote` button → calls `promote-model`; `Rollback` → calls `rollback-model`. Both confirm in a dialog and show the gate reasons.
  - **Promotion blockers** panel: lists why each shadow artifact currently can't be promoted (e.g. `insufficient_volume`, `overall_log_loss_not_better`, `major_league_collapse`).
- Backend guard: `promote-model` and `rollback-model` already use `requireAdmin`. We add the same to `run-shadow-predictions`, `train-challenger-model`, `maybe-trigger-retraining`, `evaluate-challenger-model`, and a new lightweight `is-admin` function for the UI.

## 4. CI / deploy guardrails

- **Build/parse check**: a CI script (`scripts/check-edge-functions.ts`) that runs `deno check supabase/functions/**/index.ts` so a syntax error like the `matchDateIso` one can never ship again.
- **Smoke tests** under `supabase/functions/<fn>/index_test.ts`:
  - `generate-statistical-prediction`: invokes with a mock match id, asserts a `prediction_runs` row with `run_type='pre_match'` and valid probabilities.
  - `pre-match-predictions`: asserts batch run produces ≥1 published prediction.
  - `train-challenger-model`: with seeded `training_examples`, produces a `model_artifacts` row with `status='shadow'`.
  - `pipeline-health-check`: emits at least one `pipeline_health` row when seeded with a missing-label condition.
- **LLM no-numeric-mutation test** (`supabase/functions/_shared/llm_guard_test.ts`): feeds a known prediction object through the AI explanation path and asserts that all numeric fields (`home_win`, `draw`, `away_win`, `over_under_25`, `expected_goals_*`, `predicted_score_*`) are byte-identical pre/post. Locks in the "AI is reasoning-only" rule.

## 5. Promotion policy (code-enforced, no auto-promote)

Update `_shared/promotion-gates.ts` thresholds:

- `minHoldout` stays at 200 for **shadow evaluation** (unblocks `evaluation_runs`).
- New `minHoldoutForPromotion = 100` plus `minTotalLabeled = 400` checked specifically inside `promote-model` before it accepts a promotion request. Until both are met, `promote-model` returns `{ ok:false, reason:"insufficient_evidence" }` even when an admin clicks the button.
- `evaluate-challenger-model` continues to write `evaluation_runs` from 200+ examples so we get visibility earlier.

## 6. Daily observability (LearningPipelineCard v2)

Extend `LearningPipelineCard.tsx` and `pipeline-health-check` to track and surface, per day for the last 14 days:

- new `pre_match` `prediction_runs`
- labeled pre-match runs (join `match_labels`)
- new `calibration_events`
- new `training_examples`
- `training_jobs` succeeded vs failed
- shadow artifacts created
- `evaluation_runs` created
- avg lag from `prediction_runs.created_at` to `match_labels.finalized_at`

Render as a small sparkline grid on `/accuracy` (already shows the card) and as a richer table on `/admin/models`. `pipeline-health-check` writes `pipeline_health` rows when any of these flatlines for >24h.

## 7. Explicitly out of scope (explicit non-goals for this phase)

- No bookmaker priors, rolling xG/xGA, rest/travel/congestion, or lineup-strength features. Those land in a later "Phase 5 — better features" once the loop has been observed stable for 1–2 weeks.
- No automatic promotion. Promotion stays a human, admin-only click that is also gated by the policy in §5.

---

## Technical summary

- **Migrations:** add `UNIQUE (prediction_run_id, artifact_id)` on `shadow_predictions`; add an `admin_users` table (optional, for future role-table-based admin instead of env list) — kept tiny and behind RLS via `has_role`-style function.
- **New edge functions:** `run-shadow-predictions`, `is-admin`.
- **Edited edge functions:** `evaluate-challenger-model` (use `shadow_predictions`+`match_labels` join), `promote-model` (extra evidence gate), `pipeline-health-check` (more counters), `_shared/promotion-gates.ts` (split thresholds).
- **Frontend:** new `src/pages/AdminModels.tsx`, `src/components/admin/ShadowArtifactsTable.tsx`, `AdminRoute` wrapper, route added to `App.tsx` (`/:lang/admin/models`). Extend `LearningPipelineCard.tsx` with daily counters.
- **Cron:** 5 new `cron.job` rows inserted via the insert tool.
- **CI/tests:** `scripts/check-edge-functions.ts`, four new `index_test.ts` files, one `_shared/llm_guard_test.ts`.

Reply "go" to implement, or tell me what to change.
