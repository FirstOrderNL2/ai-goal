

# Phase 2 — Baseline ML Model (Offline Benchmark)

## Reality check before building

- Labeled snapshots available: **478** (target was ≥ 2,000 from Phase 1).
- Snapshots with odds: **46** — bookmaker_probs feature will be ~90% null.
- Time window: **2026-02-21 → 2026-04-21** (2 months only) — time-based split will have ~334 train / 96 val / 48 test.
- Schema is consistent (43 keys on all rows, `weights_full` on 478/499).

**Recommendation:** proceed with Phase 2 as a **benchmark / feasibility study only**, not a production-ready model. Sample size is too small to declare ML "won" or "lost" definitively, but big enough to detect signal direction. The plan's GO/NO-GO gate is honored: if logloss does not beat Poisson, we stop.

## Execution environment

LightGBM/XGBoost are C++ libraries — not runnable inside Deno edge functions. Two viable paths:

**Chosen: Python sandbox (offline, one-shot)** — train + evaluate via `code--exec` using `lightgbm`, `scikit-learn`, `pandas`. Pull data via `psql` (managed PG env). Write artefacts (model `.txt`, metrics `.json`, comparison report `.md`, calibration plots `.png`) to `/mnt/documents/`.

This satisfies "offline only", "no production impact", "no edge function integration".

## Pipeline

### 1. Data export
SQL pulls every labeled snapshot + match outcome into a single CSV at `/tmp/training.csv`:
- features: all 43 snapshot keys flattened (nested `bookmaker_probs`, `h2h`, `intelligence`, `enrichment_flags`, `applied_weights` → dot-notation columns)
- label `y`: 0=home win, 1=draw, 2=away win, derived from `goals_home` vs `goals_away`
- `match_date` for ordering

### 2. Feature engineering (`/tmp/build_features.py`)
- Drop leakage-risk and ID-like columns: `generated_at`, `model_version`, `training_mode`, `weights_full`, `applied_weights.*`, `bucket_correction`, `quality_score`, `data_quality`, `raw_confidence`.
- Numeric scaling: standardize lambdas, form, volatility, position_diff.
- Categorical encoding: `league`, `match_stage`, `competition_type` → target-encoded with train-fold means (no leakage).
- Bookmaker probs: keep raw + add `market_agreement` flag; `NaN` allowed (LightGBM handles missing natively).
- Form strings (`WWLDL`) → 5 ordinal columns.
- H2H jsonb → `h2h_home_wins`, `h2h_draws`, `h2h_away_wins`, `h2h_total`.

### 3. Time-based split
Sort by `match_date` ascending → 70 / 20 / 10:
- Train: oldest 70%
- Validation: next 20% (early stopping)
- Test: most recent 10% (final report only, never fit on)

### 4. Models trained (`/tmp/train_ml.py`)

| Model | Purpose |
|---|---|
| **Poisson baseline** | extracted directly from snapshot's `poisson_home/draw/away_prob` — no retraining |
| **LightGBM multiclass** | objective `multiclass`, 3 classes, `num_leaves=31`, `learning_rate=0.05`, early stopping on val logloss, max 1000 rounds |
| **LightGBM + isotonic calibration** | per-class isotonic regression fit on val set |
| **Hybrid 0.7·Poisson + 0.3·ML** | linear blend on calibrated probs |

### 5. Evaluation harness (`/tmp/evaluate.py`)
On the test slice:
- **Logloss** (primary)
- **Accuracy** (argmax)
- **Brier multiclass** (sum of squared errors across the 3-class probability vector)
- **ECE** (expected calibration error, 10 bins, per-class then averaged)
- **Reliability diagrams** → PNG per model

Segment breakdowns (test set):
- High vs low volatility (`volatility` median split)
- Top leagues (Premier League, La Liga, Serie A, Bundesliga, Ligue 1) vs others
- With odds vs without odds
- Per outcome class (focus: draw recall — the plan's critical weakness zone)

### 6. Outputs to `/mnt/documents/phase2_ml_benchmark/`
- `metrics.json` — full metrics matrix
- `report.md` — Markdown comparison table + segment table + GO/NO-GO verdict
- `feature_importance.png` — top-30 LightGBM gains
- `reliability_*.png` — calibration curves per model
- `model_lgbm.txt` — saved booster (for Phase 3 reuse, not deployed)
- `predictions_test.csv` — per-match: actual, poisson probs, ML probs, hybrid probs

### 7. GO / NO-GO verdict (auto-emitted)
Hard rules from the plan:
1. ML logloss < Poisson logloss on test set → **required**
2. ML ECE < Poisson ECE → **required**
3. No regression on draw class (draw recall not lower than Poisson by > 5%) → **required**
4. Improvement holds across ≥ 50 of the 48 test matches segments (use bootstrap, 1000 resamples, 95% CI on logloss delta excludes 0) → **required**

If all 4 pass → **GO to Phase 3 (Hybrid System Design)**.
If any fail → **STOP, return to data improvement** (per plan's "If ML loses → STOP" rule).

## Strict guardrails (enforced)
- No edits to `generate-statistical-prediction` or any production prediction path.
- No new edge functions, no DB writes, no schema changes, no `ml_experiment` flag toggling production code.
- All artefacts live in `/mnt/documents/phase2_ml_benchmark/`.
- Model file is saved but **not** wired anywhere.

## Caveats reported in the final report
- Sample size (478) is below the plan's 2,000 target → results are **directional, not conclusive**.
- 2-month window means no seasonal generalization claim possible.
- Odds feature is sparse (~10%) → bookmaker_probs importance will be artificially low.
- Test set is only ~48 matches → bootstrap CI included to expose noise.

## Files created
- `/tmp/export_dataset.sql`
- `/tmp/build_features.py`
- `/tmp/train_ml.py`
- `/tmp/evaluate.py`
- `/mnt/documents/phase2_ml_benchmark/*` (artefacts)

No source-tree files modified.

