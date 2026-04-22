

# ML Pipeline Verification (Phase 1–3) + P0 hotfix

## What I found before writing this plan

Two things up front, because they reframe the audit:

1. **P0 regression — statistical predictions have been failing for hours.** The last edit introduced an undefined variable: `generate-statistical-prediction/index.ts:732` references `computedPublishStatus`, but the actual binding is `publishStatus` (line 639). Edge logs show ~150 `failed` vs 11 `success` in the last 6h, and `prediction_logs` confirms it. This is why new `low_quality` rows keep appearing and HNL/Greek matches still don't get fresh predictions. Must fix **first**, before any ML verification means anything.
2. **Phase 2 (ML model) does not exist yet.** No LightGBM/XGBoost code anywhere in the repo, no training script, no `ml_predictions` table, no model artifact. Phase 3 (comparison engine) and Phase 4 (hybrid) therefore can't be "verified" — only Phase 1 can. The audit needs to honestly report this and either (a) stop and wait for approval to build it, or (b) build the minimal Phase 2+3 stack as part of this run. Plan below does (b) with a tight scope so the user gets actual verification numbers.

Current dataset readiness from live DB:
- 1,886 predictions with `feature_snapshot` (1,849 training_only + 37 live)
- 290 reviewed labels (`actual_outcome` populated): H=125 / D=86 / A=79 — usable for supervised training
- Class balance OK (43% / 30% / 27%, no collapsed class)
- 290 samples is **below** the user's own ≥2,000 success criterion → Phase 7 will report `WARNING: insufficient labels` and the ML metrics will be reported with that caveat, not hidden.

---

## Step 0 — P0 hotfix (blocks everything else)

`supabase/functions/generate-statistical-prediction/index.ts` line 732: rename `computedPublishStatus` → `publishStatus`. One-line fix. Without it, every prediction call still throws and the audit is meaningless.

Then re-run failed predictions: one-shot invocation of `pre-match-predictions` (Phase D watchdog already re-queues `generation_status='failed'`).

---

## Step 1 — Phase 1 dataset validation (read-only)

Add `dataset-validation-report` already exists; extend it (or wrap with a thin reporter) to emit:

- **Total snapshots** / **usable supervised samples** (snapshot ∧ review with `actual_outcome`)
- **Class distribution** of `y` (H/D/A counts + %)
- **Per-feature missingness** — top 10 fields with NULL % across `feature_snapshot`
- **Schema drift** — count of distinct snapshot key-sets (should be 1; >1 means schema changed mid-collection)
- **Leakage probe** — for each reviewed sample, assert:
  - `match_enrichment.enriched_at <= matches.match_date`
  - `match_intelligence.generated_at <= matches.match_date`
  - `predictions.created_at <= matches.match_date` (the snapshot itself)
  Report violation counts. Any non-zero → flag `LEAKAGE RISK`.
- **Join health** — orphan counts: predictions without matches, reviews without predictions, snapshots whose matches are not `completed`.

Output: `/mnt/documents/phase1_validation_report.json` + a short markdown summary.

## Step 2 — Phase 2 minimal ML baseline (build, since nothing exists)

Run **outside the edge runtime** as a one-shot Python script via `code--exec`. Edge functions are the wrong place for model training (no persistent FS, 150s timeout, no scikit/xgboost). This matches the user's "ML-ready infrastructure" goal without prematurely committing to an in-app inference path.

- Pull labeled rows via `supabase--read_query` → pandas DataFrame.
- Feature set: numeric fields from `feature_snapshot` (lambda_home/away, poisson probs, league_reliability, position_diff, h2h counts, volatility, ref_strictness, market_agreement, bookmaker_probs, momentum, key_player_missing). Drop sparse string fields. Mean-impute remaining NaNs.
- **Strict time-based split** — sort by `matches.match_date`, 80/20 chronological (no shuffle). Verify train.max_date < val.min_date.
- Model: `lightgbm.LGBMClassifier(objective='multiclass', num_class=3, n_estimators=300, learning_rate=0.05)`. Light, fast, calibrated by default — no GPU.
- Metrics on val set: **logloss** (primary), **accuracy**, **ECE** (10-bin), per-class precision/recall, **top-15 feature importance**.
- Save model: `/mnt/documents/ml_model_v1.joblib` + metrics JSON + feature-importance CSV.

## Step 3 — Phase 3 comparison engine (build alongside)

Same script, no separate function:

- For every val sample, the snapshot already contains the Poisson probs (`poisson_home_prob/draw/away_prob`). No recomputation needed.
- ML probs come from the trained model on the same val rows.
- Compute side-by-side: accuracy, logloss, ECE for **Poisson vs ML**.
- Sanity asserts: probs sum to 1.000 ± 0.001, no NaN, identical sample count in both arrays.
- Output: `/mnt/documents/phase3_comparison.csv` (per-match) + summary in the report.

## Step 4 — Phase 4 hybrid simulation (cheap, do it)

In the same script: `hybrid = 0.7 * poisson + 0.3 * ml`, renormalize, compute the same 3 metrics. Also sweep weights `[0.5, 0.6, 0.7, 0.8, 0.9]` and pick the val-best — pure analysis, no production change.

## Step 5 — Phase 5 bug detection

The script + Phase 1 report cover this. Specifically auto-flag:
- Snapshots with all-null numeric features
- Predictions where `home_win + draw + away_win` ≠ 1.000 ± 0.005
- `feature_snapshot.poisson_*` mismatching the row's `home_win/draw/away_win` (consistency)
- Any `prediction_reviews.actual_outcome` not in {home, draw, away}

## Step 6 — Phase 6 production-flow verification (read-only)

Query-only checks against current state:
- % of next-48h upcoming matches with `predictions` row → must be 100%
- Distribution of `predictions.update_reason` for matches starting in <60min → expect `recheck_60`/`recheck_30`/`recheck_15`/`recheck_10`/`recheck_5` to actually appear in `prediction_logs`
- `training_only=true` rows that were modified in the last 24h → must be 0 (no live overwrite of training data)

No code changes here unless a violation is found; in that case I'll add a one-line guard to `pre-match-predictions` upsert to skip rows where `training_only=true`.

## Step 7 — Final report

`/mnt/documents/ml_verification_phase1_3.md` with the user's exact requested structure: System Status, Metrics (Poisson/ML/Hybrid table), Issues Found, Fixes Applied. Honest WARNING on dataset size (<2000) — not hidden.

---

## Files touched

- `supabase/functions/generate-statistical-prediction/index.ts` — one-line P0 fix
- `supabase/functions/dataset-validation-report/index.ts` — extend to emit leakage + schema-drift + class-balance fields the user asked for
- `/tmp/ml_phase2_3.py` (one-shot, not committed) — train + compare + hybrid
- Deliverables in `/mnt/documents/`: `phase1_validation_report.json`, `ml_model_v1.joblib`, `phase3_comparison.csv`, `ml_verification_phase1_3.md`

## Out of scope

- Productionizing ML inference into an edge function (separate phase — needs ONNX export or Python-based inference service decision).
- New `ml_predictions` DB table or schema changes — verification only.
- Retraining `model_performance` weights — orthogonal.
- Building Phase 2/3 if the user prefers to wait until ≥2,000 labels exist (see decision below).

## One decision needed

Dataset has **290 labeled samples**, well below the user's own ≥2,000 success bar. Two honest paths:

- **A. Run the full audit now** with the small dataset. Numbers will be noisy but you'll see directionally whether ML beats Poisson, and the pipeline + script are reusable when labels grow.
- **B. Run Phase 1 + Phase 6 only** (the dataset/leakage/production checks). Skip Phase 2/3/4 until labels reach ≥2,000 (current rate ~30-50/week → ~6 weeks). Avoids reporting metrics that look statistically meaningless.

Default in this plan = **A** (matches the "verify, don't plan" tone of your prompt). Reply "B" if you'd rather wait.

## Success criteria

- P0 fix deployed, `prediction_logs` shows ≥95% `success` for the next hour.
- Phase 1 report generated, leakage violations explicitly enumerated.
- Phase 3 comparison table delivered with Poisson vs ML logloss/accuracy/ECE on identical val sample.
- Hybrid weight sweep delivered.
- Final markdown lists every bug found with the exact fix applied (or `not applicable - no changes needed`).

