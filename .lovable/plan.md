

# GoalGPT — ML Full System Audit (Read-Only)

This is the audit deliverable. No code changes proposed. All numbers below pulled from live DB on `2026-04-21`.

---

## 1. Executive Summary

**Current ML maturity: PRE-ML.** The system is a calibrated Poisson engine with a statistical learning loop (calibration weights, per-league lambda shifts, holdout validation). There is **no XGBoost/LightGBM model, no hybrid simulation layer, and no ML benchmark layer** in the codebase — only the data foundation (Phase 1–5 of the previous ML Readiness Upgrade) is in place.

**Is current ML trustworthy?** N/A — no ML model exists yet. The statistical learning loop *is* trustworthy (holdout-validated, atomic revert on regression).

**Recommendation: NEEDS DATA FIXES FIRST.** Three blockers prevent moving to a real ML model: feature snapshots cover only **4.4% of predictions** (23/528), prediction coverage on completed matches is only **7.7%** (313/4055), and odds coverage is **2.8%** of all predictions covered (149 distinct matches with odds across 528 predictions).

---

## 2. Data Quality Report

### Coverage table (live)

| Dataset | Rows | Coverage on 528 predictions | Coverage on 4055 completed matches |
|---|---|---|---|
| `predictions` | 528 (508 published, 20 low_quality, 0 training_only) | 100% | **7.7%** |
| `predictions.feature_snapshot` | 23 | **4.4%** | **0.6%** |
| `predictions.training_only=true` | 0 | 0% | 0% |
| `odds` | 149 (149 distinct matches) | ~28% | ~3.7% |
| `match_features` | 676 | n/a | 16.7% |
| `match_enrichment` | 208 | ~39% | 5.1% |
| `match_intelligence` | 211 | ~40% | 5.2% |
| `match_context` | 235 | ~44% | 5.8% |
| `prediction_reviews` | 283 (all linked, `prediction_id` populated 100%) | 53.6% | 7.0% |
| `referees` | **0** | 0% | 0% |
| `model_performance` | 19 (max version 9) | n/a | n/a |

### Orphan check (FKs working)

| Table | Orphan rows |
|---|---|
| predictions → matches | 0 |
| match_features → matches | 0 |
| prediction_reviews → matches | 0 |

Phase 4 FK migration is in effect. No broken joins.

### Critical missing datasets
1. **Feature snapshots** — only 23 predictions have one. Backfill never ran.
2. **Training-only backfill predictions** — 0 rows. `backfill-training-predictions` exists but has not been executed.
3. **Odds** — 149/528 predictions covered, far from the 80% target.
4. **Referees table** — empty, so volatility model uses constant 0.5 strictness everywhere.

---

## 3. ML Validity Report

### 3.1 Feature snapshot audit

**Schema (43 keys, present on all 23 snapshots — schema is consistent):**
`lambda_home, lambda_away, base_lambda_home, base_lambda_away, poisson_home_prob, poisson_draw_prob, poisson_away_prob, league, league_reliability, league_position_home, league_position_away, position_diff, form_home, form_away, home_avg_scored, home_avg_conceded, away_avg_scored, away_avg_conceded, home_w_avg_scored, home_w_avg_conceded, away_w_avg_scored, away_w_avg_conceded, h2h, volatility, match_importance, match_stage, competition_type, is_cup, bookmaker_probs, market_agreement, enrichment_flags, intelligence, ref_strictness, team_aggression, data_quality, quality_score, model_version, applied_weights, bucket_correction, raw_confidence, training_mode, generated_at`

**Determinism:** Snapshot is built from already-computed inputs and written in the same upsert as the prediction → deterministic per generation.
**Reproducibility:** Partial. Snapshot does not store the raw `match_features` row id or `model_performance.id` it consumed, so re-deriving the exact prediction later requires the model_version pointer plus surviving `model_performance` history (kept to 20 versions). Acceptable for now.
**Schema versioning:** Single schema across all 23 rows. No drift.
**Leakage signals inside snapshot:** None detected. All fields are pre-match (form is rolling history; lambdas, Poisson probs, h2h, league position, bookmaker probs, enrichment flags, intelligence — all available before kickoff).
**`generated_at`** is correctly the prediction time, not match time.

**Risk:** `enrichment_flags` and `intelligence` are sourced from `match_enrichment` / `match_intelligence`, which are populated by `enrich-match-context` and `football-intelligence`. Those functions read live data; if they ever ran *after* a match completed (e.g. backfill), the captured values would be post-match and would leak. **No timestamp guard exists.** This is a latent leakage risk for any future backfill.

### 3.2 ML dataset validity

There is **no ML training pipeline today** — no train/test split code, no model artefact, no logloss computation.

What *would* happen if you trained on the current data:
- 23 usable rows. Far below any usable threshold.
- Labels would come from `matches.goals_home/away` joined via `match_id` → label alignment is straightforward and correct.
- No temporal split exists — must be implemented from scratch.

### 3.3 Leakage & contamination audit

| Source | Status | Evidence |
|---|---|---|
| `feature_snapshot` fields | **Clean** | All 43 keys are pre-match by construction in `generate-statistical-prediction`. |
| `match_enrichment` | **At risk for backfill** | No `enriched_at < match_date` guard. If `backfill-training-predictions` runs `enrich-match-context` retroactively, post-match data leaks into snapshots. |
| `match_intelligence` | **At risk for backfill** | Same as above; `football-intelligence` has no temporal cutoff. |
| `prediction_reviews` | **Clean** | Built from completed match results vs stored prediction. Outcome-only data, never fed back into snapshot. |
| `compute-model-performance` calibration weights | **Clean** | Holdout is the most recent 7 days; training uses prior data only. |
| `match_features` | **Mostly clean** | `home_form_last5/away_form_last5` is rolling — derived from prior matches. Risk: if recomputed after the match, last entry could include the match itself. Worth verifying. |

**Leakage severity score: 2/10 today**, **rises to 7/10 the moment the historical backfill runs without a temporal guard.**

### 3.4 Model design

There is no ML model. The plan-on-record (per project memory) is residual learning over Poisson, but nothing is implemented.

**Is residual-over-Poisson conceptually correct? YES** — it preserves the calibrated statistical backbone, learns only the residual, avoids destroying the working engine, and aligns with the system's existing weight-revert validation pattern.

**Is a direct classifier conceptually correct? NO for this stage** — too few labelled rows (23 with snapshot, 283 with reviews), and the existing Poisson engine is already calibrated. A from-scratch classifier would underperform.

### 3.5 Evaluation system

- `compute-model-performance` computes Brier scores per target (1X2, O/U 2.5, BTTS), composite Brier, holdout Brier with full Poisson re-simulation. **Correctness: high.**
- No logloss or ECE computation today — would need to be added for ML evaluation.
- Hybrid weighting: does not exist yet.

---

## 4. System Risks (top failure points)

1. **Snapshot coverage 4.4%** — backfill function exists but was never run. Without ≥2k snapshots, no ML model is viable.
2. **Backfill leakage trap** — `backfill-training-predictions` calls the live pipeline. If `match_enrichment`/`match_intelligence` are populated post-match, every backfilled snapshot is contaminated. No `enriched_at` ≤ `match_date` check is enforced.
3. **Odds coverage 28%** of predictions, 3.7% of completed matches — `bookmaker_probs` is null on 72% of snapshots, killing market-based features.
4. **Referees table empty** — `ref_strictness` is constant; one feature is dead.
5. **Model_version pointer fragility** — snapshots reference `model_version`, but `compute-model-performance` prunes versions beyond 20. Old snapshots will lose their reference once version 30 is reached.
6. **No temporal split scaffolding** — the moment ML training begins, time-based CV must be built; no helper exists.
7. **`generate-ai-prediction` 503 errors in logs** — Lovable AI gateway returning 1102 (rate/quota). Not blocking statistical engine but FIL narrative occasionally fails.

---

## 5. Recommendation

**NEEDS DATA FIXES FIRST.** Readiness score: **35/100**.

### Top 5 blockers (in execution order)
1. **Add temporal-cutoff guard to backfill** before running it. `backfill-training-predictions` must skip enrichment/intelligence rows where `enriched_at` / `generated_at` > `match_date`, or rebuild them with a frozen pre-match window.
2. **Run `backfill-training-predictions`** to push snapshot coverage to ≥2,000 rows.
3. **Run `backfill-odds`** to push odds coverage on published predictions to ≥80%.
4. **Pin model_performance versions** referenced by snapshots (or copy `applied_weights` fully into snapshot — already done partially) so old snapshots stay reproducible after pruning.
5. **Populate `referees` table** via API-Football referees endpoint, or remove `ref_strictness` from the feature vector.

### Recommended ML architecture (when data is ready)
**Residual classifier over Poisson, gradient-boosted (LightGBM), time-series CV.**
- Inputs: full `feature_snapshot` + Poisson outputs.
- Target: actual H/D/A.
- Output: residual logit added to Poisson logits, then softmax + isotonic calibration.
- Evaluation: composite Brier vs current Poisson on a strictly later time window. Adopt only if Brier improves > 1% with no regression in any target.
- Deployment pattern: parallel to current engine, blended via learned weight inside `compute-model-performance` validation, atomic revert on regression — same shape as the existing learning loop.

### Go/no-go decision
**NO-GO for ML model implementation today.** Re-evaluate after blockers 1–3 are resolved (snapshot ≥ 2k, odds ≥ 80%, no leakage).

