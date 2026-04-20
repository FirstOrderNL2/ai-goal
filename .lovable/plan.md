` wrapper and present findings directly. (Plan rules say: "Skip for research".)

# GoalGPT — Full Prediction & Learning System Audit

## Phase 1 — Prediction Pipeline (how a prediction is born)

**File: `supabase/functions/generate-statistical-prediction/index.ts` (601 lines)**

End-to-end flow per match:

```text
match_id
  ├─ Fetch: odds, match_features, last 20 home matches, last 20 away matches,
  │         last 200 league matches, referee, team_discipline, latest model_performance,
  │         match_enrichment, match_intelligence
  │
  ├─ λ_home, λ_away built from:
  │     • exponentially-weighted (decay 0.85^i) avg goals scored/conceded last 20
  │     • normalized by league avg (or 1.45 / 1.15 fallback)
  │     • OR overridden by match_features.poisson_xg_* if present
  │
  ├─ Lambda multiplicative adjustments (in order):
  │     1. H2H dominance ........................ ±5%
  │     2. League position diff ................. ±5% (cap at 10-pos gap)
  │     3. ou_lambda_adjustment (LEARNED) ....... additive ±0.15
  │     4. Enrichment: missing players ......... −5% per missing (cap −15%)
  │     5. Enrichment: news_sentiment .......... −3% if < −0.5
  │     6. Enrichment: weather_impact .......... up to −5%
  │     7. Stage (final/SF/QF) ................. −3% to −5%
  │     8. Championship/KKD regression ......... 30% pull to league mean
  │     9. Relegation battle ................... −5%
  │     ─ clamp [0.3 .. 4.0]
  │
  ├─ 1X2 from Σ poisson(λ_h, h)·poisson(λ_a, a) over 9×9 grid
  │
  ├─ 1X2 additive adjustments:
  │     • home_bias_adjustment (LEARNED) .......... ±0.03 base
  │     • net_draw = draw_calibration + draw_underpredict_boost − draw_overpredict_penalty
  │     • Lambda-similarity draw boost ............ up to +6% when |λ_h−λ_a|<0.3
  │     • Stage draw boost ........................ +2% to +5%
  │     • Volatility draw boost ................... up to +2%
  │     ─ renormalize so HW+DR+AW = 1
  │
  ├─ Predicted score: argmax of 6×6 Poisson grid, BUT forced to match the 1X2 winner
  │   (e.g. if pred = home but argmax score is a draw → fall back to bestScoreHW)
  │
  ├─ Confidence (independent of probabilities!):
  │     raw = (dataQuality·0.6 + marketAgreement·0.4) · leagueRelFactor − totalConfPenalty
  │     where:
  │        dataQuality   = weighted has-feature checklist (form, odds, features, league size)
  │        marketAgreement = closeness to bookmaker implied probs
  │        leagueRelFactor ∈ [0.7..1.0]
  │        totalConfPenalty = volatilityPenalty + |confidence_deflator| + |leaguePenalty|
  │     Then: + bucketCorrection (LEARNED, per 10% bucket)
  │            + intelligence.confidence_adjustment (FIL, ±0.10)
  │     ─ clamp [0.10 .. 0.95]
  │
  └─ Upsert into predictions
```

### Critical observations on the prediction engine

1. **Confidence is decoupled from outcome probability.** It measures *data quality + market agreement*, not the strength of the pick. A 38/32/30 split can have the same confidence as a 70/20/10 split. This is a **major root cause** of the calibration problem (see Phase 3).
2. **Predicted score forced to match 1X2 winner** (lines 481–487) is correct logic but kills score-MAE because the natural Poisson mode is often a draw (1-1) even when one side is a slight favorite.
3. **9 different additive/multiplicative draw boosts stack** (H2H, λ-similarity, stage, volatility, draw_calibration, draw_underpredict_boost) with no coordination. Easy to over- or under-shoot.
4. **Enrichment is silently ignored if the row doesn't exist** — there is no "missing data" penalty on confidence beyond dataQuality, and `match_enrichment` rows are sparse.
5. **`features.poisson_xg_*` overrides everything** (line 215). If `compute-features` ever stores a stale or wrong xG, the engine will skip the live exponentially-weighted recalculation entirely.

---

## Phase 2 — Learning Loop (`compute-model-performance/index.ts`, 507 lines)

```text
batch-review-matches → fills prediction_reviews rows (outcome/OU/BTTS correctness, error_type)
                ↓
compute-model-performance (gated: only fires if currentTotal − last_learning_match_count ≥ 50)
                ↓
        Reads last 1000 completed matches + their predictions + features + reviews
                ↓
        Temporal weighting: w = 0.95^weeks_ago × (1.5 if importance > 0.7) × (0.7 if > 8.57 weeks)
                ↓
        Computes: outcome_acc, OU acc, BTTS acc, Brier scores, MAE, calibration buckets,
                  goal-line accuracy, league accuracy, weak_areas
                ↓
        Generates 4 weight bundles:
          numeric_weights:        home_bias, draw_calibration, ou_lambda, conf_deflator, league_penalty_*
          error_weights:          draw_overpredict_penalty, draw_underpredict_boost, overconfidence_penalty
          calibration_corrections: per-bucket additive correction (±0.15 cap)
          feature_weights:        human-readable labels only (NOT used by predictor)
                ↓
        Validation: simulate "what would the new weights have predicted" on the most-recent 30 matches
          if newAcc − oldAcc ≥ +0.5%   → "passed"
          if within ±0.5%              → "marginal" (still applied)
          if worse by > 0.5%           → "failed" → revert to prevWeights
          if no prior error_weights    → "bootstrap" auto-pass
                ↓
        Insert new model_performance row, increment model_version
                ↓
        Delete model_performance rows beyond the 20 most recent
```

### Critical observations on the learning loop

1. **The learning gate is broken.** `last_learning_match_count` is set to `currentTotal` (the count of `status='completed'` matches in the DB, capped at 1000) — **not** the count of `prediction_reviews`. The latest v4 row stores `last_learning_match_count: 1000`, meaning the gate will never fire again until you have 1050 *completed matches*, not 1050 *reviews*. With 280 actual reviews, the system is effectively frozen.
2. **The "validation" is theatre.** It simulates *only* `home_bias_adjustment` + `draw_calibration` on 30 matches. It does NOT simulate `ou_lambda`, `confidence_deflator`, `league_penalty_*`, `error_weights`, or `calibration_corrections` — so most weights bypass validation entirely.
3. **The 30-match validation set is the same 30 matches used to compute the new weights** — circular. New weights will almost always look "passed" on data they were fit on.
4. **`feature_weights` are descriptive strings only.** They appear in the dashboard but **the prediction engine never reads them**. Line 462 stores them; nothing imports them. The "form: Moderate (44%)" label has zero effect on predictions.
5. **No regularization, no shrinkage.** `draw_calibration` is computed as `actual_draw_rate − pred_draw_rate` clamped to ±0.05 — a single noisy 90-day window can flip the sign.
6. **Calibration corrections are applied additively to confidence** but are **calculated from outcome correctness** at confidence buckets — that's a half-correct mapping. A confidence of 0.65 means "we trust this pick 65%", but the actual outcome rate at that bucket includes wrong picks too. The correction is doing the right thing structurally, but the data behind it is sparse (see Phase 3).

---

## Phase 3 — Accuracy breakdown (real DB numbers, 280 reviews)

### Headline numbers
| Metric | Value | Reality |
|---|---|---|
| 1X2 outcome accuracy | **44.6%** (125/280) | Below random-favorite baseline (~46%) |
| OU 2.5 accuracy | **60.7%** (170/280) | Acceptable |
| BTTS accuracy | **53.9%** (151/280) | Barely above coin-flip |
| Exact score | 32/280 = **11.4%** | Industry norm 8–12%, OK |
| MAE goals | **1.95** | Poor (good models ≈ 1.4) |
| Avg confidence | **0.55** | Honest given data quality |

### Accuracy by predicted outcome (the smoking gun)
| Pick | Count | Correct | Accuracy |
|---|---|---|---|
| Home | 142 | 76 | **53.5%** |
| Away | 78 | 33 | **42.3%** |
| Draw | 60 | 16 | **26.7%** ← collapse |

### Actual outcome distribution
Home **43.2%**, Draw **29.3%**, Away **27.5%** (n=280).
Model predicts home **51.9%**, draw **20.3%**, away **27.9%** of the time → **draw under-predicted by 9pp**, but when it does pick a draw it's wrong 73% of the time. The system has a *quantity-vs-quality* draw problem: too few drawn picks, and the few it makes are noise.

### Calibration buckets (predicted vs actual hit-rate)
| Bucket | n | avg pred conf | actual acc | gap |
|---|---|---|---|---|
| 50–60% | 71 | 0.458 | **0.310** | −15pp (overconfident) |
| 60–70% | 116 | 0.562 | 0.491 | −7pp |
| 70–80% | 54 | 0.669 | 0.537 | −13pp |
| 80–90% | 11 | 0.755 | 0.455 | **−30pp** |
| 90+%   | 4–5 | 0.85+ | 0.0–0.4 | catastrophic |

The **higher the confidence, the worse the relative miss**. Classic overconfidence in the upper bands, plus very few samples — high-conf picks are unreliable AND rare.

### Accuracy by league (only meaningful samples)
| League | n | 1X2 acc |
|---|---|---|
| Premier League | 19 | **63.2%** ✅ |
| Bundesliga | 27 | 51.9% |
| Champions League | 8 | 87.5% (small n) |
| 2. Bundesliga | 8 | 62.5% (small n) |
| Serie A | 29 | 44.8% |
| Ligue 1 | 25 | 44.0% |
| La Liga | 20 | 40.0% |
| Eredivisie | 18 | 38.9% |
| Keuken Kampioen Divisie | 39 | 48.7% |
| **Championship** | **49** | **28.6%** ❌ |
| Europa League | 8 | 0.0% (small n) |

The Championship and Eredivisie are dragging the global average. The applied `league_penalty_championship: -0.079` only deflates *confidence* — it doesn't change *which side* is picked, so accuracy doesn't improve.

### Top error patterns
| Error | Count | % of misses |
|---|---|---|
| `false_draw` (predicted draw, was H/A) | 44 | 28% |
| `missed_draw` (predicted H/A, was draw) | 42 | 27% |
| `wrong_winner` (low-conf H↔A flip) | 30 | 19% |
| `goals_overestimated` | 9 | 6% |
| `overconfident_home` | 8 | 5% |

**>55% of all errors are draw-related**, evenly split between false-positive and false-negative draws. The current draw-calibration mechanism (a single ±5% scalar) cannot fix both at once.

---

## Phase 4 — Behavioral profile

- Average distribution across 513 stored predictions: **38.8% / 30.1% / 31.1%** (H/D/A). Reasonable shape.
- But the *picked* (argmax) distribution is **51.9% / 20.3% / 27.9%** — i.e. the engine is almost never confident enough to *pick* a draw, yet generates 30% draw probability on average.
- Average confidence 0.516 → the model honestly admits it's a coin-flip on most matches. Good honesty, bad UX.
- Only ~6% of predictions cross the 65% confidence "high-conf" threshold, and those are the worst-calibrated band. **High-conf picks should not be displayed as such until the band stabilizes.**

---

## Phase 5 — Is learning actually working?

Looking at the last 12 `model_performance` snapshots over ~10 days:
- `outcome_accuracy` drifted 41.5 → 46.2 (mostly from sample size growing, not weight changes)
- `avg_brier_1x2` 0.654 → 0.634 (marginal)
- `mae_goals` 1.90 → 1.97 (got worse)
- `model_version` jumped from 1 to 4 only after a single human-triggered run; pre-v4 rows all show `last_learning_match_count: 0` (gate logic was bypassed)
- v4 weights are **almost identical** to v1's: `confidence_deflator -0.07` (same), `draw_calibration 0.05 vs 0.03`, `league_penalty_championship −0.079 vs −0.08`. The "learning" produced cosmetic deltas.
- Gate is now stuck at `1050`, but only **280 reviews** exist → **system will not retrain in the foreseeable future**.

**Verdict: the loop is averaging, not learning. And the gate is silently broken.**

---

## Phase 6 — Top 5 structural weaknesses (impact-ranked)

1. **Confidence is divorced from probability strength.** The strongest pick gets the same confidence as the weakest if the data inputs match. → drives the inverted calibration curve.
2. **Learning gate counts the wrong thing.** Uses `completed matches` not `reviewed predictions`, locks itself for hundreds of matches at a time, and never retrains.
3. **Validation layer is circular and partial.** Trains on 30 matches and validates on the same 30, ignoring 4 of 5 weight families.
4. **Draw modeling is a single scalar.** Cannot simultaneously reduce false-draws and add missed-draws because they require league-/match-shape-specific behavior.
5. **No league or weak-team gating on whether to publish a prediction.** Championship matches get full visibility despite 28% accuracy, contaminating the public accuracy number.

Honourable mentions: forced winner-consistency on the predicted score inflates MAE; `feature_weights` are dead variables consumed by humans only; `match_features.poisson_xg_*` silently overrides live recalculation.

---

## Phase 7 — Improvement roadmap (concrete & prioritized)

**Priority 1 — Unblock learning (1 small fix)**
- Change `compute-model-performance` to set `last_learning_match_count = allReviews.length` (or `count(prediction_reviews)`), and gate on `currentReviews − prevReviews ≥ 50`. This restores the cycle. Mirror the same field name in `useTotalReviewCount`/Accuracy page (already done).

**Priority 2 — Confidence redesign**
- New formula: `confidence = clamp(maxProb × leagueRelFactor × dataQualityMultiplier, 0.10, 0.90)` where `maxProb = max(HW, DR, AW)` after all adjustments.
- Then apply `bucketCorrection` and `confidence_deflator` as today. This couples confidence to the actual probability mass and will fix the inverted calibration curve.

**Priority 3 — Per-league lambda calibration, not just confidence penalty**
- Replace `league_penalty_*` (confidence-only) with `league_lambda_shift_home` / `league_lambda_shift_away` learned from systematic over/under-scoring per league. Championship λ is too high relative to actual scoring volatility.

**Priority 4 — Two-sided draw calibration**
- Replace the single scalar with `(predDraw - actualDraw)` regression per league shape: separate corrections for "tight" matches (|λ_h−λ_a|<0.3) vs "skewed" matches. Target driving both `false_draw` and `missed_draw` toward 22% each instead of 27/28%.

**Priority 5 — Honest validation**
- Holdout-based: compute new weights on matches older than 7 days, validate on the *most recent* 7 days only. If `newBrier ≤ oldBrier × 1.005` keep, else revert. Apply across all weight families, not just home/draw.

**Priority 6 — "Do not predict" gate**
- Suppress public display (or mark as "low confidence — informational") when:
  - `dataQuality < 0.45`, OR
  - `leagueRelFactor < 0.75` AND `confidence < 0.55`, OR
  - one team has < 5 completed matches in the last 90 days, OR
  - no `match_features` row exists.
- This will reclaim the headline accuracy by ~5–8pp without changing the model.

**Priority 7 — Wire up dead signals**
- Read `feature_weights.form` and apply a `±2%` lambda nudge based on form differential (currently computed but unused).
- Penalize confidence by `0.03` when `match_enrichment` row is missing (currently silently OK).

---

## Phase 8 — Realistic performance targets

For a 1X2 model on European football using only public data + form + odds + light context, the academic ceiling is **~52–55% outcome accuracy** with calibrated probabilities (Brier ≈ 0.55–0.60). Top commercial models with player-tracking/xG-chains hit ~56–58%.

Realistic GoalGPT targets after the Priority 1–6 fixes, on a 200+ review window:
| Metric | Today | 90-day target | Stretch |
|---|---|---|---|
| 1X2 outcome | 44.6% | **49–51%** | 53% |
| OU 2.5 | 60.7% | 62–64% | 65% |
| BTTS | 53.9% | 56–58% | 60% |
| Brier 1X2 | 0.634 | 0.59 | 0.56 |
| MAE goals | 1.95 | 1.65 | 1.45 |
| High-conf (≥65%) hit rate | 51% | **62%+** | 68% |

"Always >50% accuracy" is achievable **only** if the "do not predict" gate (Priority 6) is enabled — by suppressing the bottom ~25% of low-quality predictions, the displayed accuracy on what remains can comfortably sit above 52%. Without that gate, the structural ceiling on this dataset is ~50%.

---

### Success criteria check
- ✅ End-to-end pipeline mapped (Phase 1–2)
- ✅ Root cause identified: broken learning gate + confidence/probability decoupling + draw modeling
- ✅ Learning impact disproven (v1→v4 weights effectively identical, gate stuck)
- ✅ 7 concrete, prioritized actions provided

I can implement any subset of Priority 1–7 next — Priority 1 (unblock the gate) is a 5-line fix and would let the system actually learn from the 280 existing reviews tonight. Want me to start there?

<lov-actions>
<lov-suggestion message="Implement Priority 1: fix the learning gate in compute-model-performance to count prediction_reviews instead of completed matches, then trigger a recalibration cycle so Model v5 gets generated from the actual 280 reviews.">Fix the learning gate (Priority 1)</lov-suggestion>
<lov-suggestion message="Implement Priority 2: redesign the confidence formula to couple it with the max probability (maxProb × leagueRelFactor × dataQualityMultiplier) so calibration stops inverting in the high-confidence bands.">Redesign confidence formula (Priority 2)</lov-suggestion>
<lov-suggestion message="Implement Priority 6: add a 'do not publish' gate that hides predictions when dataQuality < 0.45 or league reliability is low, so the displayed accuracy reflects only high-quality picks.">Add 'do not predict' gate (Priority 6)</lov-suggestion>
<lov-suggestion message="Implement Priority 4: replace the single draw_calibration scalar with two-sided per-shape calibration (tight vs skewed matches) to reduce both false_draw and missed_draw errors.">Two-sided draw calibration (Priority 4)</lov-suggestion>
<lov-suggestion message="Implement Priority 5: rewrite the validation layer to use a true 7-day holdout, validate on Brier across ALL weight families, and revert on regression instead of the current circular 30-match check.">Honest holdout validation (Priority 5)</lov-suggestion>
</lov-actions>That tool call was a mistake — I don't need plan--create. Let me just send the audit directly as my message.

# GoalGPT — Full Prediction & Learning System Audit

## Phase 1 — Prediction Pipeline (how a prediction is born)

**File: `supabase/functions/generate-statistical-prediction/index.ts` (601 lines)**

```text
match_id
  ├─ Fetch: odds, match_features, last 20 home matches, last 20 away matches,
  │         last 200 league matches, referee, team_discipline, latest model_performance,
  │         match_enrichment, match_intelligence
  │
  ├─ λ_home, λ_away built from:
  │     • exponentially-weighted (decay 0.85^i) avg goals scored/conceded last 20
  │     • normalized by league avg (or 1.45 / 1.15 fallback)
  │     • OR overridden by match_features.poisson_xg_* if present
  │
  ├─ Lambda multiplicative adjustments (in order):
  │     1. H2H dominance ........................ ±5%
  │     2. League position diff ................. ±5%
  │     3. ou_lambda_adjustment (LEARNED) ....... additive ±0.15
  │     4. Enrichment: missing players .......... −5% per missing (cap −15%)
  │     5. Enrichment: news_sentiment ........... −3% if < −0.5
  │     6. Enrichment: weather_impact ........... up to −5%
  │     7. Stage (final/SF/QF) .................. −3% to −5%
  │     8. Championship/KKD regression .......... 30% pull to league mean
  │     9. Relegation battle .................... −5%
  │     ─ clamp [0.3 .. 4.0]
  │
  ├─ 1X2 from Σ poisson(λ_h, h)·poisson(λ_a, a) over 9×9 grid
  │
  ├─ 1X2 additive adjustments:
  │     • home_bias_adjustment (LEARNED)
  │     • net_draw = draw_calibration + draw_underpredict_boost − draw_overpredict_penalty
  │     • Lambda-similarity draw boost ........... up to +6% when |λ_h−λ_a|<0.3
  │     • Stage draw boost ....................... +2% to +5%
  │     • Volatility draw boost .................. up to +2%
  │     ─ renormalize so HW+DR+AW = 1
  │
  ├─ Predicted score: argmax of 6×6 Poisson grid, BUT forced to match the 1X2 winner
  │
  └─ Confidence (independent of probabilities!):
        raw = (dataQuality·0.6 + marketAgreement·0.4) · leagueRelFactor − totalConfPenalty
        + bucketCorrection (LEARNED) + intelligence.confidence_adjustment (FIL)
        ─ clamp [0.10 .. 0.95]
```

### Critical observations
1. **Confidence is decoupled from outcome probability.** It measures *data quality + market agreement*, not pick strength. A 38/32/30 split gets the same confidence as a 70/20/10 split with similar inputs. Major root cause of inverted calibration.
2. **Predicted score forced to match 1X2 winner** is correct logic but inflates score-MAE because the natural Poisson mode is often a draw even with a slight favorite.
3. **Nine different draw boosts stack** with no coordination. Easy to over- or under-shoot.
4. **`match_features.poisson_xg_*` overrides live recalculation** — stale features silently win.
5. Enrichment is silently ignored when missing — no confidence penalty.

---

## Phase 2 — Learning Loop (`compute-model-performance`)

```text
batch-review-matches → fills prediction_reviews (correctness + error_type)
        ↓
compute-model-performance (gate: currentTotal − last_learning_match_count ≥ 50)
        ↓ reads last 1000 completed matches + predictions + reviews
        ↓ temporal weighting: w = 0.95^weeks × (1.5 if importance>0.7) × (0.7 if >8.57wk)
        ↓ produces 4 weight bundles:
           numeric_weights, error_weights, calibration_corrections, feature_weights
        ↓ Validation: simulate weights on most-recent 30 matches
              passed (+0.5%) / marginal (±0.5%) / failed → revert
              bootstrap = auto-pass when no prior error_weights
        ↓ Insert new model_performance row, increment model_version
```

### Critical observations
1. **The learning gate counts the wrong thing.** `last_learning_match_count` is set to `currentTotal` (completed matches, capped at 1000), not the count of `prediction_reviews`. The latest v4 row stores `1000`, so the gate won't fire again until 1050 *completed matches* exist, while only **280 reviews** are stored. **The system is frozen.**
2. **Validation is theatre.** Simulates only `home_bias_adjustment` + `draw_calibration` on 30 matches. `ou_lambda`, `confidence_deflator`, `league_penalty_*`, `error_weights`, `calibration_corrections` all bypass validation.
3. **Circular validation** — the same 30 matches are used for both fitting and validation.
4. **`feature_weights` are dead variables** — stored, displayed, but never read by the predictor.
5. **No regularization** — `draw_calibration` can flip sign on a single noisy 90-day window.

---

## Phase 3 — Accuracy breakdown (real DB, 280 reviews)

| Metric | Value | Verdict |
|---|---|---|
| 1X2 outcome accuracy | **44.6%** | Below random-favorite baseline (~46%) |
| OU 2.5 accuracy | 60.7% | Acceptable |
| BTTS accuracy | 53.9% | Barely above coin-flip |
| Exact score | 11.4% | Industry norm |
| MAE goals | 1.95 | Poor (good ≈ 1.4) |
| Avg confidence | 0.55 | Honest |

### Accuracy by predicted outcome (smoking gun)
| Pick | n | Correct | Acc |
|---|---|---|---|
| Home | 142 | 76 | **53.5%** |
| Away | 78 | 33 | 42.3% |
| Draw | 60 | 16 | **26.7%** ← collapse |

Actual outcomes: H 43% / D 29% / A 28%. Model picks: H 52% / D 20% / A 28% — **draws under-picked by 9pp, and when picked are wrong 73% of the time**.

### Calibration buckets (predicted vs actual)
| Bucket | n | avg pred | actual | gap |
|---|---|---|---|---|
| 50–60% | 71 | 0.46 | 0.31 | −15pp |
| 60–70% | 116 | 0.56 | 0.49 | −7pp |
| 70–80% | 54 | 0.67 | 0.54 | −13pp |
| 80–90% | 11 | 0.76 | 0.46 | **−30pp** |

**Higher confidence → worse miss.** Inverted calibration.

### League accuracy (meaningful samples)
| League | n | 1X2 acc |
|---|---|---|
| Premier League | 19 | **63.2%** ✅ |
| Bundesliga | 27 | 51.9% |
| Serie A | 29 | 44.8% |
| Ligue 1 | 25 | 44.0% |
| La Liga | 20 | 40.0% |
| Eredivisie | 18 | 38.9% |
| KKD | 39 | 48.7% |
| **Championship** | **49** | **28.6%** ❌ |

`league_penalty_championship: −0.079` only deflates *confidence*, not *which side is picked* — accuracy doesn't move.

### Top error patterns
| Error | Count | % of misses |
|---|---|---|
| `false_draw` | 44 | 28% |
| `missed_draw` | 42 | 27% |
| `wrong_winner` | 30 | 19% |

**>55% of all errors are draw-related**, evenly split — the single-scalar draw calibration cannot fix both at once.

---

## Phase 4 — Behavioral profile

- 513 stored predictions: avg HDA = 38.8% / 30.1% / 31.1% (reasonable shape)
- Picked HDA = 51.9% / 20.3% / 27.9% (almost never confident enough to pick a draw)
- Avg confidence 0.516 → honestly admits coin-flip on most matches
- Only ~6% of predictions cross 65% — and that's the worst-calibrated band

---

## Phase 5 — Is learning actually working?

Last 12 snapshots over 10 days:
- `outcome_accuracy` 41.5 → 46.2 (driven by sample growth, not weight changes)
- `mae_goals` 1.90 → 1.97 (got worse)
- `model_version` only jumped 1→4 after a manual run; pre-v4 rows all have `last_learning_match_count: 0`
- v4 weights nearly identical to v1: `confidence_deflator −0.07` (same), `draw_calibration 0.05 vs 0.03`, `league_penalty_championship −0.079 vs −0.08`

**Verdict: the loop is averaging, not learning. The gate is silently broken.**

---

## Phase 6 — Top 5 structural weaknesses

1. **Confidence divorced from probability strength** — drives inverted calibration
2. **Learning gate counts the wrong field** — system locked, never retrains
3. **Validation is circular and partial** — 4 of 5 weight families bypass it
4. **Draw modeling is one scalar** — can't reduce false-draws and missed-draws simultaneously
5. **No publishing gate** — Championship's 28% accuracy poisons the global number

---

## Phase 7 — Improvement roadmap (prioritized)

**P1 — Unblock learning (5-line fix)**
Change `compute-model-performance` to set `last_learning_match_count = allReviews.length` and gate on `currentReviews − prevReviews ≥ 50`. Restores the cycle immediately.

**P2 — Confidence redesign**
`confidence = clamp(maxProb × leagueRelFactor × dataQualityMultiplier, 0.10, 0.90)` then apply bucket correction + deflator. Couples confidence to actual probability mass.

**P3 — Per-league lambda calibration**
Replace confidence-only `league_penalty_*` with `league_lambda_shift_home/away` learned from systematic over/under-scoring per league.

**P4 — Two-sided draw calibration**
Separate corrections for tight matches (|λ_h−λ_a|<0.3) vs skewed matches.

**P5 — Honest holdout validation**
Train on matches >7 days old, validate on most-recent 7 days using Brier across **all** weight families. Revert on regression.

**P6 — "Do not predict" gate**
Suppress public display when `dataQuality < 0.45`, league reliability < 0.75 with conf < 0.55, team has <5 matches in 90 days, or no `match_features` row. Reclaims 5–8pp of headline accuracy.

**P7 — Wire up dead signals**
Apply `±2%` λ nudge from form differential. Penalize confidence by 0.03 when enrichment row missing.

---

## Phase 8 — Realistic targets

Academic ceiling for public-data football models: ~52–55% 1X2 accuracy. Top commercial models with player tracking: 56–58%.

| Metric | Today | 90-day target | Stretch |
|---|---|---|---|
| 1X2 outcome | 44.6% | **49–51%** | 53% |
| OU 2.5 | 60.7% | 62–64% | 65% |
| BTTS | 53.9% | 56–58% | 60% |
| Brier 1X2 | 0.634 | 0.59 | 0.56 |
| MAE goals | 1.95 | 1.65 | 1.45 |
| High-conf hit rate | 51% | **62%+** | 68% |

**"Always >50% accuracy" is achievable only with the P6 publishing gate enabled.** Without it, the structural ceiling on this dataset is ~50%.

---

P1 is a 5-line fix and would let the system learn from the 280 existing reviews tonight. Recommend starting there.

<lov-actions>
<lov-suggestion message="Implement Priority 1: fix the learning gate in compute-model-performance to count prediction_reviews instead of completed matches, then trigger a recalibration cycle so Model v5 gets generated from the actual 280 reviews.">Fix the learning gate (P1)</lov-suggestion>
<lov-suggestion message="Implement Priority 2: redesign the confidence formula to couple it with the max probability (maxProb × leagueRelFactor × dataQualityMultiplier) so calibration stops inverting in the high-confidence bands.">Redesign confidence formula (P2)</lov-suggestion>
<lov-suggestion message="Implement Priority 6: add a 'do not publish' gate that hides predictions when dataQuality < 0.45 or league reliability is low, so displayed accuracy reflects only high-quality picks.">Add 'do not predict' gate (P6)</lov-suggestion>
<lov-suggestion message="Implement Priority 4: replace the single draw_calibration scalar with two-sided per-shape calibration (tight vs skewed matches) to reduce both false_draw and missed_draw errors.">Two-sided draw calibration (P4)</lov-suggestion>
<lov-suggestion message="Implement Priority 5: rewrite the validation layer to use a true 7-day holdout, validate on Brier across ALL weight families, and revert on regression instead of the circular 30-match check.">Honest holdout validation (P5)</lov-suggestion>
</lov-actions>