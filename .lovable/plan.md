

# GoalGPT Full System Audit Report — April 12, 2026

## AI Learning Verdict: **Partially Learning**

The model IS updating weights and applying calibration adjustments. Performance has improved measurably over 8 days. However, critical data gaps (zero odds data, low feature coverage) severely limit what the model can learn from.

---

## Phase 1: Data Pipeline & Integrity

| Dataset | Records | Status |
|---------|---------|--------|
| Matches | 4,423 | Healthy, no duplicates |
| Teams | 836 | Good |
| Team Statistics | 147 | Low — only 17.6% of teams have stats |
| Odds | **0** | **CRITICAL: Completely empty** |
| Referees | **0** | Empty — volatility model uses defaults |
| Match Features | 232 (58 upcoming) | Only 12.4% of upcoming matches have features |
| Match Context | 201 (26 upcoming) | Only 5.6% of upcoming matches have context |
| Players | Present | Not used in predictions |
| Cancelled matches | 8 | Properly marked, no issue |

**Critical Finding**: The odds table has zero rows. The prediction engine's "value detection" (Best Pick edge-based selection, market agreement confidence boost) is completely non-functional. Every prediction runs with `impliedHome = null`, meaning:
- Best Pick never detects market edges
- Market agreement defaults to 0.5 (neutral), reducing confidence accuracy
- 20% of the data quality score is always 0

---

## Phase 2: Feature Engineering & Utilization

### Features the model uses:
- Team form (last 20 matches, exponentially weighted at 0.85 decay) ✅
- League averages (home/away goals from last 200 league matches) ✅
- Poisson xG from match_features ✅
- Referee strictness → volatility score ❌ (no referee data)
- Team discipline → volatility score (partial — data exists)
- Odds → implied probabilities ❌ (no odds data)
- Model performance weights (draw_calibration, confidence_deflator, league penalties) ✅

### Underutilized data:
- **H2H results** exist in match_features but are NOT used by the statistical engine
- **League position** (home/away) exists in match_features but NOT used
- **Position difference** exists but NOT used
- **Clean sheet %** and **BTTS %** from features are NOT used (engine computes its own)
- **xG data** (xg_home, xg_away on matches table) is NOT fed back into learning

---

## Phase 3: Model Learning Verification

### Weight evolution (April 4 → April 12):
```text
Date       | Matches | 1X2 Acc | O/U Acc | BTTS Acc | MAE
Apr 4      |   60    |  55.0%  |  43.3%  |  50.0%   | 2.60
Apr 5      |   44    |  34.1%  |  59.1%  |  54.5%   | 1.85
Apr 11     |  150    |  44.7%  |  56.7%  |  56.7%   | 1.95
Apr 12     |  164    |  43.9%  |  57.3%  |  56.1%   | 1.92
```

**Verdict**: O/U improved +14pp, BTTS improved +6pp, MAE improved -0.68. However, 1X2 accuracy DROPPED from 55% to 43.9% as the sample grew — the early high was likely noise from a small sample. The model IS learning (weights update, calibration adjustments flow through), but the learning is shallow because:

1. No odds data means no market signal
2. 409 of 467 upcoming matches lack computed features
3. The confidence-accuracy relationship is partially inverted (0.5 conf = 32.3% acc, 0.6 conf = 55.3% acc) — confidence bands below 0.6 are unreliable

### Current active weights:
- `draw_calibration: +0.03` (boosting draws — correct, draws were underpredicted)
- `confidence_deflator: -0.086` (deflating overconfident predictions — correct)
- `league_penalty_championship: -0.093` (penalizing Championship — correct, 25.7% acc)
- `home_bias_adjustment: 0` (neutral)
- `ou_lambda_adjustment: 0` (neutral)

---

## Phase 4: Prediction Accuracy by League

| League | N | 1X2 Acc | O/U Acc | Goals Err |
|--------|---|---------|---------|-----------|
| Serie A | 16 | **62.5%** | 56.3% | 1.80 |
| Women's CL | 9 | 55.6% | **88.9%** | 2.44 |
| Bundesliga | 15 | 53.3% | **73.3%** | 1.57 |
| Ligue 1 | 13 | 53.8% | **84.6%** | 1.85 |
| Keuken Kampioen | 25 | 44.0% | 56.0% | 2.36 |
| Eredivisie | 17 | 41.2% | 47.1% | 2.00 |
| Premier League | 5 | 40.0% | 40.0% | 2.46 |
| La Liga | 16 | 37.5% | **68.8%** | 1.65 |
| **Championship** | **35** | **25.7%** | 45.7% | 1.63 |
| Europa League | 4 | **0.0%** | 25.0% | 1.98 |

### Error patterns:
- `false_draw`: 31 — model predicts a winner but result is a draw
- `missed_draw`: 24 — model predicts draw but there was a winner
- `wrong_winner`: 13 — predicted the wrong team

---

## Phase 5: Feedback Loop Validation

```text
Match played → status='completed' → batch-review-matches → prediction_reviews
  → compute-model-performance → model_performance.numeric_weights
    → generate-statistical-prediction reads weights → applies adjustments
```

**Loop status**: WORKING but with gaps:
- 35 completed matches with predictions remain unreviewed (backlog)
- 31 duplicate `model_performance` records (upsert uses INSERT, not true upsert by period)
- The loop has no mechanism to RE-PREDICT old matches with new weights — it only affects future predictions

---

## Phase 6: Backend Health

- Edge functions: All operational, no errors in recent logs
- `generate-statistical-prediction`: Fixed and deployed, running clean
- `sync-football-data`: Active, 6,963 API calls remaining
- 8 matches currently live (legitimate)
- No crashes or timeouts detected

---

## Phase 7: Frontend Validation

- SEO URLs: Corrected to goalgpt.io ✅
- i18n: All keys present ✅
- Console: No errors (only React Router deprecation warnings) ✅
- Mobile header: Fixed ✅

---

## Implementation Plan

### CRITICAL (Must Fix)

**1. Populate the odds table** — The entire value detection and market agreement system is dead without odds data.
- In `sync-football-data`, add odds fetching from API-Football's `/odds` endpoint
- Store in the existing `odds` table
- This alone could improve 1X2 accuracy by 5-10pp

**2. Fix feature coverage gap** — 409/467 upcoming matches lack computed features.
- In `compute-features`, increase the scan range and ensure it processes ALL upcoming matches, not just a limited batch
- Features (poisson_xg, form, league position) are critical inputs

### MEDIUM (Should Fix)

**3. Use H2H and league position data** — These exist in `match_features` but the statistical engine ignores them.
- Add H2H adjustment: if team A beat team B in 3 of last 5, boost team A's lambda by ~5%
- Add position differential: larger gaps = higher favorite confidence

**4. Clean up model_performance duplicates** — 31 records exist, many duplicates per day. The upsert doesn't have a unique constraint on (period_start, period_end).
- Add a unique index or deduplicate before inserting

**5. Fix confidence calibration** — The 0.5 confidence band has only 32.3% accuracy (should be ~50%). 
- The confidence formula overweights `dataQuality` (which is always low because odds=0 and features are sparse)
- After populating odds, confidence should auto-correct

**6. Review 35 unreviewed completed matches** — Trigger `batch-review-matches` to process the backlog.

### MINOR (Nice to Fix)

**7. Use xG data from completed matches** — `matches.xg_home` and `matches.xg_away` are stored but never used for learning or feature computation.

**8. Feed player data into predictions** — 836 players exist but are unused.

**9. React Router v6 deprecation warnings** — Set future flags.

### Step-by-step implementation:

1. **Fix `compute-features`** to process all upcoming matches (increase batch limit)
2. **Add odds ingestion** to `sync-football-data` using API-Football `/odds` endpoint
3. **Add H2H and position adjustments** to `generate-statistical-prediction`
4. **Add unique constraint** on `model_performance` to prevent duplicates
5. **Trigger batch-review + compute-model-performance + pre-match-predictions** to refresh the pipeline

