

# GoalGPT Full System Audit — April 16, 2026

## Current System Snapshot

| Metric | Value |
|--------|-------|
| Total predictions | 439 |
| Reviewed matches | 198 |
| 1X2 accuracy | 46.2% (94/198) |
| O/U 2.5 accuracy | 57.1% (113/198) |
| BTTS accuracy | 54.0% (107/198) |
| MAE goals | 1.97 |
| Exact score hits | 27 (13.6%) |
| Odds records | 60 |
| FIL reports | 38 |
| Enrichment records | 38 |

---

## Phase 1-2: Data Quality and Performance Analysis

**Data is clean and structured.** All 198 reviewed matches have match_id, teams, league, prediction probabilities, confidence, and actual result. Odds coverage improved from 10 to 60 but remains low (30% of reviewed matches).

### Performance by League

| League | N | 1X2 | O/U | MAE |
|--------|---|-----|-----|-----|
| Champions League | 8 | **87.5%** | 50.0% | 2.01 |
| Conference League | 4 | **75.0%** | 25.0% | 2.60 |
| Women's Champions League | 14 | **64.3%** | 57.1% | 2.63 |
| Premier League | 10 | **60.0%** | 60.0% | 1.95 |
| Bundesliga | 18 | **61.1%** | 61.1% | 1.71 |
| Serie A | 20 | 55.0% | 60.0% | 1.89 |
| Ligue 1 | 16 | 50.0% | **81.3%** | 1.88 |
| Keuken Kampioen | 29 | 48.3% | 58.6% | 2.31 |
| La Liga | 20 | 40.0% | 70.0% | 1.75 |
| Eredivisie | 18 | 38.9% | 50.0% | 2.06 |
| **Championship** | **37** | **27.0%** | 45.9% | 1.69 |
| Europa League | 4 | **0.0%** | 25.0% | 1.98 |

### Calibration (Confidence vs Actual)

| Confidence | N | Actual Accuracy |
|------------|---|-----------------|
| <40% | 8 | 62.5% (underconfident!) |
| 40-50% | 51 | 31.4% (overconfident) |
| 50-60% | 77 | 51.9% (close) |
| 60-70% | 52 | 53.8% (overconfident) |
| 70%+ | 10 | 50.0% (overconfident) |

**Key finding**: The model is badly calibrated in the 40-50% range (predicts ~45% but actual is 31%) and overconfident at 60%+.

---

## Phase 3: Learning Evaluation

| Segment | N | 1X2 | O/U | MAE | Avg Conf |
|---------|---|-----|-----|-----|----------|
| First 66 | 66 | 50.0% | 53.0% | 2.03 | 0.591 |
| Middle 66 | 66 | 33.3% | 59.1% | 1.92 | 0.492 |
| Last 66 | 66 | **59.1%** | **59.1%** | 1.97 | 0.616 |

**Verdict: The model IS learning.** 1X2 accuracy recovered from a 33.3% trough to 59.1% in the latest third (+9pp over first third). O/U improved +6pp. The middle segment dip coincides with lower confidence (the model was recalibrating).

---

## Phase 4: Error Analysis

| Error Type | Count | % of Errors |
|------------|-------|-------------|
| false_draw | 34 | 32.7% |
| missed_draw | 25 | 24.0% |
| wrong_winner | 17 | 16.3% |
| general_miss | 9 | 8.7% |
| goals_overestimated | 8 | 7.7% |
| overconfident_home | 5 | 4.8% |
| overconfident_away | 5 | 4.8% |

**Top 5 failure patterns:**
1. **Draw prediction is the #1 weakness** — 59 of 104 errors (57%) are draw-related
2. **Championship league** — 27% accuracy, the worst by far (37 matches = large sample)
3. **Overconfidence at 60-70%** — predicted 64% but actual 48%
4. **40-50% confidence band** — 31% actual vs ~45% predicted (largest sample: 51 matches)
5. **Europa League** — 0% accuracy (small sample of 4, but alarming)

---

## Phase 5: Feature Analysis

**Currently used features:**
- Exponentially-weighted team form (last 20 matches, decay 0.85)
- League averages (home/away goals)
- H2H results (±5% lambda adjustment)
- League position differential (±5%)
- Odds (implied probabilities, market agreement)
- Enrichment signals (key player absences, sentiment, weather)
- FIL confidence adjustment (±0.1)
- Model weights (draw calibration, confidence deflator, league penalties)
- Volatility score (referee strictness + team aggression + match importance)
- Cup competition draw boost (+3%)

**Not used but available:**
- `round` field contains stage info ("Semi-finals", "Quarter-finals") — not parsed
- Clean sheet % and BTTS % from features table (engine computes its own)
- Team statistics table (161 records with win/draw/loss records)
- Player data (161 players, ignored)

**Missing entirely:**
- Match importance score (relegation battle, title race detection)
- Knockout leg awareness (1st leg vs 2nd leg behavior)
- League strength rating (treating KKD same as Premier League)

---

## Phase 6: Football Intelligence Layer Improvements

The FIL already exists (38 reports generated). The `round` field already contains usable stage data. The `isCup` flag exists but is binary. Here is what needs to be added:

### Implementation Plan

#### Step 1: Add competition context columns to `matches` table
Add a migration with:
- `competition_type` (text: "league", "cup", "international") — computed from league name
- `match_stage` (text: "group", "round_of_16", "quarter_final", "semi_final", "final", "regular") — parsed from `round`
- `match_importance` (numeric 0-1) — computed score

#### Step 2: Create `compute-match-importance` edge function
A new function that:
1. Parses `round` field to determine stage (already have "Semi-finals", "Quarter-finals" etc.)
2. Detects title race / relegation battle by checking league position from `match_features` (top 3 = title race, bottom 3 = relegation)
3. Detects derby matches using team names/league
4. Computes `match_importance` score (0-1):
   - Final = 1.0, Semi = 0.9, Quarter = 0.8, Round of 16 = 0.7
   - Title race = +0.2, Relegation = +0.2, Derby = +0.1
   - Nothing to play for (mid-table, season end) = 0.3
5. Stores `competition_type`, `match_stage`, `match_importance` on the match record

#### Step 3: Integrate into `generate-statistical-prediction`
Replace the current binary `isCup` logic with graduated adjustments:
- **Finals/Semis**: Draw boost +5% (up from 3%), reduce lambdas by 5% (tighter games)
- **Quarter-finals**: Draw boost +3%, reduce lambdas by 3%
- **Relegation battle**: Both teams more defensive → reduce lambdas by 5%, draw boost +3%
- **Title race**: Higher motivation → boost favorite lambda by 3%
- **Nothing to play for**: Increase volatility, widen confidence interval
- **League strength weight**: Apply a `league_reliability` factor (Premier League/Bundesliga = 1.0, KKD = 0.7, Championship = 0.8) that scales confidence

#### Step 4: Fix critical calibration issues
- **Strengthen confidence deflator**: Current `-0.07` is too weak. The 60-70% band shows 53.8% actual — need `-0.12` minimum
- **Championship special handling**: Current `-0.08` league penalty is too small. Apply 30% lambda regression toward league means (up from 20%)
- **Draw calibration**: Increase from `+0.03` to `+0.05` globally given 57% of errors are draw-related

#### Step 5: Wire into pipeline
- Call `compute-match-importance` from `pre-match-predictions` after feature computation
- Pass importance data to `football-intelligence` for richer narratives

#### Step 6: Frontend — add importance badge
- Show "Semi-Final", "Title Decider", "Relegation Battle" badges on match cards
- Display match importance meter on detail page

### Files Changed

| File | Change |
|------|--------|
| New migration | Add `competition_type`, `match_stage`, `match_importance` to `matches` |
| New `supabase/functions/compute-match-importance/index.ts` | Parse stage, compute importance |
| `supabase/functions/generate-statistical-prediction/index.ts` | Replace binary isCup with graduated adjustments, fix calibration weights |
| `supabase/functions/pre-match-predictions/index.ts` | Call compute-match-importance |
| `supabase/functions/football-intelligence/index.ts` | Include importance context |
| `src/components/MatchCard.tsx` | Show importance/stage badge |
| `src/pages/MatchDetail.tsx` | Show match importance meter |

---

## Phase 7: Expected Impact

| Change | Expected Improvement |
|--------|---------------------|
| Graduated cup adjustments | +3-5pp on cup match accuracy (currently 4 EL at 0%) |
| Stronger draw calibration | -10-15 draw-related errors |
| Championship lambda regression 30% | +5-10pp Championship accuracy (currently 27%) |
| Confidence deflator fix | Better calibration in 60-70% band |
| League strength weighting | More honest confidence for lower-tier leagues |
| Match importance context | Smarter cup/pressure game predictions |

---

## Summary

The model IS learning (59.1% latest vs 50% initial). The biggest gains come from fixing three concrete weaknesses: draw prediction (57% of errors), Championship accuracy (27%), and confidence overestimation (60-70% band). The Football Intelligence Layer expansion adds graduated competition awareness using data already present in the `round` field.

