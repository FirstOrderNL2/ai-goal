

# ML System Verification (Phase 1–3) — re-run on the new 2,023-label dataset

## Why re-run now

Last verification ran when the dataset was 290 labels — too small to draw real conclusions. After the Data Growth Engine backfill landed, we now have **2,023 labeled samples**, which crosses the user's own ≥2,000 success bar. The pipeline can finally be benchmarked with statistically meaningful numbers.

## What this run will deliver

A single end-to-end audit covering all seven phases requested, with concrete metrics and a written report — same structure as last pass, but with real numbers instead of caveats.

### Phase 1 — Dataset validation (read-only SQL + script)
- Total labeled samples, class balance H/D/A, % missing per `feature_snapshot` field
- Schema-drift check: count of distinct snapshot key-sets across all rows
- Leakage probe: assert `match_enrichment.enriched_at`, `match_intelligence.generated_at`, `predictions.created_at` all `<= matches.match_date`. Report violation counts.
- Join health: orphan rows in `predictions`, `prediction_reviews`, `match_features`
- Output: `/mnt/documents/phase1_validation_report.json` + markdown summary

### Phase 2 — ML baseline (LightGBM multiclass, run via `code--exec`)
- Pull labeled rows via SQL → pandas
- Feature set: numeric fields from `feature_snapshot` (lambdas, Poisson probs, league_reliability, position_diff, h2h, volatility, ref_strictness, market_agreement, bookmaker_probs, momentum, key_player_missing). Mean-impute NaN.
- **Strict chronological 80/20 split** by `matches.match_date` — assert `train.max_date < val.min_date`
- Model: `LGBMClassifier(objective='multiclass', num_class=3, n_estimators=300, learning_rate=0.05)`
- Metrics: logloss (primary), accuracy, ECE (10-bin), per-class precision/recall, top-15 feature importance
- Save: `/mnt/documents/ml_model_v1.joblib` + metrics JSON + feature-importance CSV

### Phase 3 — Comparison engine (Poisson vs ML)
- Same val rows: pull `poisson_home/draw/away_prob` from snapshots, ML probs from model
- Side-by-side accuracy / logloss / ECE
- Sanity asserts: probs sum 1.000 ± 0.001, no NaN, identical sample count
- Per-match comparison CSV at `/mnt/documents/phase3_comparison.csv`

### Phase 4 — Hybrid simulation
- `hybrid = w * poisson + (1-w) * ml`, sweep w ∈ {0.5, 0.6, 0.7, 0.8, 0.9}, renormalize
- Same 3 metrics per weight, pick val-best
- Pure analysis, no production change

### Phase 5 — Bug detection
Auto-flag in the script:
- Snapshots with all-null numeric features
- `home_win + draw + away_win ≠ 1.000 ± 0.005`
- `feature_snapshot.poisson_*` mismatching the row's `home_win/draw/away_win`
- `actual_outcome` not in {home, draw, away}
- Predictions with `generation_status='failed'` in last 24h

### Phase 6 — Production-flow verification (read-only)
- % next-48h matches with predictions row → must be 100%
- `update_reason` distribution in `prediction_logs` for kickoff-imminent matches → expect `recheck_60/30/15/10/5` entries (verifying the Data Growth Engine fix actually works in production)
- `training_only=true` rows modified in last 24h → must be 0
- Generation success rate over last 6h (post-hotfix verification)

### Phase 7 — Final report
`/mnt/documents/ml_verification_v2.md` with the user's exact requested structure:
- System Status (per-phase OK/WARNING/FAIL)
- Metrics table: Poisson vs ML vs Hybrid (accuracy, logloss, ECE)
- Issues Found (bug list)
- Fixes Applied (or "no fix needed — already healthy")

## Files touched

- `/tmp/ml_verification_v2.py` — one-shot Python (LightGBM + scikit-learn, not committed)
- Deliverables in `/mnt/documents/`: `phase1_validation_report.json`, `ml_model_v1.joblib`, `phase3_comparison.csv`, `ml_verification_v2.md`

**No edge function or schema changes** unless Phase 5/6 surfaces a real bug. If they do, fixes will be applied in the same run and listed in the report.

## Out of scope

- Productionizing ML inference into an edge function (separate decision — needs ONNX export or Python service architecture)
- Creating an `ml_predictions` DB table
- Retraining production weights in `model_performance`
- Building a model-trigger automation (the `ml_readiness_v` view already signals "ready"; the user decides when to wire it)

## Success criteria

- Phase 1 report shows ≥2,000 usable labels, 0 leakage violations, 0 orphan joins
- Phase 2 produces a trained `.joblib` model with logloss reported on a held-out chronological val set
- Phase 3 delivers identical-sample-size Poisson vs ML metrics
- Phase 4 reports best hybrid weight + its delta vs pure Poisson and pure ML
- Phase 6 confirms `update_reason` is now populating (not all-NULL like last audit) and 100% next-48h coverage holds
- Final markdown is one document, includes every metric, and explicitly states whether ML beats Poisson on this dataset

