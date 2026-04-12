

# GoalGPT Full System Audit — April 12, 2026

## AI Learning Verdict: **Partially Learning** (improving)

The model is updating weights and accuracy is trending upward across all metrics. However, critical data gaps (near-zero odds data, no referee data) still limit learning depth.

---

## Phase 1: Data Pipeline

| Dataset | Records | Status |
|---------|---------|--------|
| Matches | 4,423 | Healthy |
| Teams | 836 | Good |
| Team Statistics | 161 | Low (19.3% coverage) |
| Odds | **10** | Was 0, now populating — still critically low |
| Referees | **0** | Empty |
| Match Features | **641** | Major improvement (was 232) |
| Match Context | 201 | Low |
| Predictions | 418 | +88 since last check |
| Prediction Reviews | 173 | +10 since last check |
| Model Performance | 9 | Clean (deduplication worked) |
| Players | 161 | Not used in predictions |

Feature coverage for upcoming matches: **466/466 (100%)** — fixed from 12.4%. Odds remain critically low at 10 records.

---

## Phase 2: Feature Utilization

**Now used** (new since last audit):
- H2H results from match_features (+/-5% lambda adjustment)
- League position differential (+/-5% lambda adjustment)

**Still unused:**
- xG data from completed matches (not fed back into learning)
- Clean sheet % and BTTS % from features (engine computes its own)
- Player data (161 players, ignored)
- Referee data (0 records anyway)

---

## Phase 3: Model Learning — Weight Evolution

```text
Date    | N   | 1X2   | O/U   | BTTS  | MAE  | Exact
Apr 4   |  60 | 55.0% | 43.3% | 50.0% | 2.60 |  —
Apr 5   |  44 | 34.1% | 59.1% | 54.5% | 1.85 |  —
Apr 10  | 106 | 41.5% | 54.7% | 52.8% | 2.00 | 11.3%
Apr 11  | 150 | 44.7% | 56.7% | 56.7% | 1.95 | 14.7%
Apr 12  | 174 | 44.8% | 56.9% | 55.2% | 1.92 | 13.8%
```

**Trends**: 1X2 recovering (+3.3pp from trough), O/U +13.6pp, BTTS +5.2pp, MAE -0.68. Model IS learning.

Active weights: `draw_calibration: +0.03`, `confidence_deflator: -0.086`, `league_penalty_championship: -0.093`

---

## Phase 4: Accuracy by League (173 reviews)

| League | N | 1X2 | O/U | MAE |
|--------|---|-----|-----|-----|
| Serie A | 17 | **58.8%** | 58.8% | 1.77 |
| Bundesliga | 16 | **56.3%** | 68.8% | 1.56 |
| Champions League | 4 | **75.0%** | 25.0% | 2.18 |
| Conference League | 4 | **75.0%** | 25.0% | 2.60 |
| Premier League | 8 | **62.5%** | 50.0% | 1.88 |
| Ligue 1 | 13 | 53.8% | **84.6%** | 1.85 |
| La Liga | 17 | 41.2% | **64.7%** | 1.72 |
| Keuken Kampioen | 26 | 42.3% | 57.7% | 2.33 |
| **Championship** | **35** | **25.7%** | 45.7% | 1.63 |
| Europa League | 4 | **0.0%** | 25.0% | 1.98 |

Error patterns: `false_draw: 32`, `missed_draw: 24`, `wrong_winner: 15`

---

## Phase 5: Feedback Loop

```text
Match → completed → batch-review (28 unreviewed remain) → prediction_reviews
  → compute-model-performance → numeric_weights → generate-statistical-prediction
```

Loop is **working**. Unique index on model_performance prevents duplicates (9 clean records, was 31).

---

## Phase 6-7: Backend & Frontend

- All edge functions: operational, clean shutdown logs (no crashes)
- Confidence range: 0.10–0.78 (floor working, no more 0.01 outliers)
- 196/418 predictions have AI reasoning (47%)
- Console: LanguageSwitcher ref warning + React Router deprecation warnings
- 259 upcoming matches still need predictions (backfill ongoing)

---

## Issues Summary

### CRITICAL
1. **Odds data still near-empty (10 records)** — The sync was added but has only populated 10 rows. The odds ingestion may be failing silently or hitting API limits. Need to investigate `sync-football-data` odds fetching logic and logs.

### MEDIUM
2. **259 upcoming matches lack predictions** — Backfill progressing but slow (~15/batch). Need to accelerate.
3. **28 completed matches unreviewed** — Trigger `batch-review-matches`.
4. **Championship at 25.7%** — Apply stronger lambda regression (20% instead of 10%).
5. **Draw prediction weakness** — 32 false draws + 24 missed draws = 56 draw-related errors out of 96 total errors (58%). The `draw_calibration: +0.03` is too small.

### MINOR
6. **LanguageSwitcher ref warning** — Wrap component with `React.forwardRef`.
7. **React Router v6 deprecation warnings** — Add future flags.
8. **47% AI reasoning coverage** — Consider triggering AI enrichment for predictions that lack it.

---

## Implementation Plan

### Step 1: Fix odds ingestion
Investigate why only 10 odds records were inserted. Check the `sync-football-data` odds fetching code for errors, API response parsing, and league coverage. Fix and re-run to populate odds for all upcoming matches.

### Step 2: Accelerate prediction backfill
Trigger `pre-match-predictions` multiple times to cover the 259 gap, or increase batch size.

### Step 3: Process 28 unreviewed matches
Trigger `batch-review-matches` then `compute-model-performance` to update weights.

### Step 4: Strengthen draw calibration
Increase `draw_calibration` adjustment or add a draw-specific Poisson boost in `generate-statistical-prediction` (e.g., boost draw probability by 5-8% when lambdas are close).

### Step 5: Fix LanguageSwitcher ref warning
Wrap `LanguageSwitcher` component with `React.forwardRef`.

### Step 6: Add React Router future flags
Set `v7_startTransition` and `v7_relativeSplatPath` in the BrowserRouter.

