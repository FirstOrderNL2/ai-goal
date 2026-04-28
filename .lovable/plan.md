
# Why predictions are still off — and what's missing

I pulled the actual numbers behind the last 30 days of live published predictions and traced what data actually feeds each one. Three findings, ordered by impact.

## TL;DR

**The model IS learning** (Brier improved from 0.857 in Aug 2025 to 0.638 today; v12 holdout passed validation with +0.0175 Brier improvement; calibration weights flow into every new prediction). 

**But it's hitting a hard ceiling at ~42% outcome accuracy** because:
1. **It almost never commits to a confident prediction** — 85% of all live predictions have a top probability between 35% and 55%. The model is essentially saying "I don't really know" on 9 out of 10 matches.
2. **It is missing the data that would let it commit** — lineups confirmed: 0/415, weather: 0/415, referee: 1/415, odds movement: 16/415, real-time market signal: 111/415. The enrichment layer exists but is empty.
3. **Where the model IS confident (≥50%), accuracy jumps to 60–100%.** The engine works; it's starving for signal.

## Finding 1 — The model is uncertainty-locked, not wrong

Confidence distribution across the last 415 live published predictions:

| Top probability | # of predictions | % of total |
|---|---|---|
| <35% | 3 | 0.7% |
| 35–45% | 329 | **79.3%** |
| 45–55% | 98 | 23.6% |
| 55–65% | 64 | 15.4% |
| >65% | 34 | 8.2% |

When the engine actually has signal, it does well:

| Confidence bucket | n | Hit rate |
|---|---|---|
| 50–60% | 22 | **63.6%** |
| 60–70% | 8 | 50.0% |
| 70–80% | 8 | **75.0%** |
| >80% | 2 | 100.0% |

So the loss isn't in the math — it's that 79% of predictions cluster around the "I have no idea" zone, where outcome is essentially a coin flip among three buckets. The model's overall 42.5% accuracy is the weighted average of "great when I'm sure" + "random when I'm not" with the latter dominating volume.

## Finding 2 — The enrichment layer is wired up but mostly empty

For 415 recent live predictions:

| Data source | Coverage | What's missing |
|---|---|---|
| `match_features` (xG, form, position) | 100% | OK |
| `match_enrichment` row exists | 82% | OK shell |
| └─ `lineup_confirmed` | **0%** | Never marked true even at kickoff |
| └─ `referee_cards_avg` | **0.2%** | 1 of 415 |
| └─ `weather_impact` | **0%** | Field exists, nothing populates it |
| └─ `odds_movement_home/away` | **3.9%** | Almost no movement tracked |
| `match_intelligence` | 27% | Most matches have no AI tactical layer |
| └─ `market_signal` | 27% | Same |
| `odds` table | 29% | Most matches have no odds at all |
| `match_context` (injuries, news) | **7.5%** | Scraper isn't keeping up |

The Poisson backbone is therefore running on **just team form + league averages + position**. That's enough to separate Bayern at home vs. a relegation team, but not enough to separate two mid-table teams in form, which is most of the schedule.

## Finding 3 — Confusion matrix shows the specific failure mode

Last 30 days, predicted vs. actual outcome:

| Predicted ↓ / Actual → | home | draw | away | Total | Hit % |
|---|---|---|---|---|---|
| **home** (118 picks) | 61 | 25 | 32 | 118 | 51.7 |
| **draw** (42 picks) | 21 | 7 | 14 | 42 | 16.7 |
| **away** (66 picks) | 21 | 16 | 29 | 66 | 43.9 |

Two clear failures:
- **Predicted draws hit 16.7%** — when the model commits to a draw, it's wrong 5 out of 6 times. Predicted-goal totals on those: 2.45 avg expected vs. 3.86 actual when away wins, vs. 3.43 when home wins. The "draw" label is firing on matches that turn out to be high-scoring blowouts. The xG model is failing to detect mismatches.
- **Predicted away wins hit only 43.9%** — and 16 of 66 turn into draws (avg actual goals 1.75 vs predicted 3.12). Translation: when xG slightly favors the away side, the actual game is *defensive and low-scoring* and ends 1-1.

Both failures point to the same gap: **the model can't see in-match context** (lineup strength, injury impact, motivation, weather, ref). Without those, two fixtures with identical xG profiles are treated identically, even when one is a relegation 6-pointer and the other is a dead-rubber end-of-season game.

## Is the AI actually learning?

**Yes, but slowly and with the wrong leverage:**

- v12 model holds **15 league-specific lambda shifts**, **2 shape-conditional draw calibrations**, **6 confidence bucket corrections**, **3 error-type weights**. All flow into every new prediction (verified in feature_snapshot dump above).
- 7-day holdout Brier validation: v12 improved 0.0175 vs. v11. Real signal.
- BUT: every weight learned so far is a **post-hoc calibration on outputs**, not a new input feature. Learning to say "Eredivisie home goals -0.184" is helpful but it's polishing a model that's blind. You can't calibrate your way out of missing data.

## What it actually needs to get past 42% accuracy

Ranked by expected lift if the existing pipelines were filled:

1. **Confirmed lineups at T-60min** (currently 0%). A missing key striker or starting GK swings xG by 0.4–0.7 goals — bigger than any learned league shift. The `match_enrichment.lineup_confirmed` flag exists; the scraper needs to be wired up or use API-Football's `/fixtures/lineups` endpoint at T-60.
2. **Live odds & odds movement** (currently 4–29%). Sharp money moves before kickoff are the single most predictive single signal in football betting research. We have the `odds` table; we just don't poll it.
3. **Injury / suspension list** (currently 7.5% via match_context). API-Football has `/injuries` per fixture. Each missing first-team player is roughly worth 0.15 goals in xG.
4. **Referee profile** (currently 0.2%). `referees` table exists with `yellow_avg`, `foul_avg`, `penalty_avg` — populated but not joined into match_enrichment for predictions.
5. **Weather at venue** (currently 0%). Wind > 25 km/h or rain reduces total goals by ~0.3. Cheap API call.
6. **Match-importance / motivation** (partially exists as `match_importance` numeric). Cup finals, relegation 6-pointers, and dead rubbers behave differently — this is set on most matches but isn't bucketed cleanly.

Once these inputs exist, the calibration loop will have something meaningful to learn from. **Calibration on a blind model is what we have today.** Calibration on a sighted model is where the real accuracy gains live.

## Suggested fix sequence (no code yet — just the plan)

| Phase | Change | Expected lift |
|---|---|---|
| P1 | Wire `enrich-match-context` to API-Football `/fixtures/lineups` at T-60 → set `lineup_confirmed`, capture starting XI strength | +3–5% accuracy on imminent matches |
| P2 | Backfill `odds` table via API-Football `/odds` (avg + opening + closing) for next-7-days fixtures every 6h | +2–4% accuracy, unlocks value-bet card |
| P3 | Pull `/injuries` into `match_context.injuries_home/away` daily; deduct 0.1–0.3 from xG per missing first-team player | +2–3% accuracy |
| P4 | Join `referees.yellow_avg/foul_avg` into `match_enrichment.referee_cards_avg` at fixture creation | smaller, but improves O/U calibration |
| P5 | Add weather fetch (free OpenWeather/Open-Meteo) at T-2h → populate `weather_impact` | +1–2% on outdoor matches |
| P6 | Once inputs exist, expand `compute-model-performance` to learn weights for these new features (right now they're not in the feature space) | compounding |

Realistic ceiling once P1–P3 are live: **48–52% outcome accuracy, Brier ≈ 0.55**. Industry benchmarks for purely statistical models without insider info top out around 54%, so this would put GoalGPT in the credible zone.

## What I'd like to confirm before building

1. Should I start with **P1 (lineups)** since it has the biggest single lift and we already poll API-Football?
2. Should I keep the current `compute-model-performance` cadence or move it to its own daily cron (per the previous audit)?

If you say "go" I'll start with P1+P2+P3 in parallel since they're independent fetches into independent tables.
