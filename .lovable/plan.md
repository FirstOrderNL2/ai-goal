

# Prediction pipeline audit — bugs & disconnects found

I audited the full lifecycle: generation → publish gate → snapshot → display → review. Findings below, ordered by severity.

## 🔴 Critical bugs

### 1. `auto-sync` over-aggressively flips matches to `completed` with NULL scores
`supabase/functions/auto-sync/index.ts` Step 4 marks any `upcoming`/`live` match older than 3h as `completed` regardless of whether API-Football ever returned a final score. Today: **10 of 15 completed matches have `goals_home/goals_away = NULL`**. Cascade impact:
- Match details page shows "Final" with blank score.
- `generate-post-match-review` runs the prompt with "X 0 - 0 Y" garbage or skips Brier scoring → useless review or none at all.
- `coverage-alert` correctly flags 13/15 missing reviews and they will never resolve because the matches will never get scores retroactively.

**Fix:** before flipping to `completed`, require `goals_home IS NOT NULL`. For matches with no score after 3h, set a new status like `unknown` / `postponed_or_cancelled` and exclude them from review pipelines and from the live UI.

### 2. `pre_match_snapshot` is never written for the 99% case
`supabase/functions/pre-match-predictions/index.ts` only writes `pre_match_snapshot` inside Phase C (HT, line 255) — i.e. only when a match goes to halftime live. **0 of 386 recent predictions have it set.** That makes `PredictionComparisonCard` (`src/components/PredictionComparisonCard.tsx` returns `null` when snapshot is null) a permanently-empty card.

**Fix:** snapshot the prediction once at T-60min in Phase B (the first `recheck_60` write). Persist that as `pre_match_snapshot` so any later refresh can be diff'd against the canonical pre-kickoff state.

### 3. 150 generation failures earlier today: `computedPublishStatus is not defined`
Already self-resolved (current code uses `gate.publishStatus`), but the error shows that **the catch path silently writes a `publish_status='low_quality'` row with `home_win=0.33, draw=0.34, away_win=0.33, confidence=0.10`** (`generate-statistical-prediction/index.ts:836-848`). Those placeholder rows pollute downstream analytics and look like real predictions to the calibration loop.

**Fix:** in the catch path do **not** upsert a fake prediction row. Just write the `prediction_logs` failure entry and let the watchdog retry. If a sentinel is needed, mark it with a distinct `update_reason='error_placeholder'` AND exclude that reason from `compute-model-performance`, `prediction_reviews`, and any UI query.

## 🟠 High-impact disconnects

### 4. `MLReadinessPanel` ref warning (console)
`src/components/MLReadinessPanel.tsx:56` — `Metric` is a function component receiving a ref (likely from a Tooltip/Popover trigger). Wrap with `React.forwardRef` or pass `asChild` differently. Repeats every render cycle.

### 5. Catch-path placeholder vs real low_quality
The publish gate produces legitimate `low_quality` rows when `leagueRelFactor < 0.5` or no team IDs. The catch-path also writes `publish_status='low_quality'`. Two semantically different things share one label, so monitoring/UI can't distinguish "AI failed" from "data too thin".

**Fix:** add `generation_status='failed'` exclusion in any "low_quality count" metric, or use distinct `publish_status='error'`.

### 6. Watchdog retries log "attempt=1 failed" but never escalate
`prediction_logs` shows 3 retries today logged as `failed` with `error='attempt=1'`. The number is misleading (it's the attempt counter, not an error message), and there's no max-attempts bookkeeping in the log so we can't tell whether retries succeeded later.

**Fix:** retry log should write `error=<actual message>` and `update_reason=recheck_<n>_attempt_<k>`; on final failure write a separate `action='retry_exhausted'` entry.

## 🟡 Medium / cleanup

### 7. `prediction_intervals` is appended without de-duplication
Phase B pushes `{at, minutesBefore, window}` every successful refresh; Phase C pushes `{label:'HT'}`. There's no cap, no schema validation, no chronological sort. Over many reruns this array grows unbounded for live matches.

**Fix:** cap to last 20 entries and dedupe by `window`/`label` within a single sweep.

### 8. AI reasoning coverage drop-off is silent
22 of 386 predictions have meaningful AI reasoning, 16 are "tiny" (<50 chars), 348 are null. By design the AI path only runs in `recheck_*` windows (≤60min before kickoff). That's defensible, but the UI has no signal "AI analysis pending" vs "no analysis available" — the empty state looks the same as a bug.

**Fix:** in the prediction card, show "AI analysis runs in the final hour before kickoff" when `update_reason='initial'` and `match_date - now > 60min`.

### 9. `feature_snapshot` is null on 333/386 (86%)
Only set when `compute-features` produced a row before generation. The generator does not lazily compute features when missing — it just proceeds with defaults, which is why ~85% of confidence values cluster at the same 0.41 (default-features signal).

**Fix:** in `generate-statistical-prediction`, if no `match_features` row exists, invoke `compute-features` for that one match before continuing, with a 5s timeout. Cache the result inline.

### 10. `best_pick` is "Over 1.5" 52% of the time
202 of 386 = monoculture, suggesting the best-pick scorer's threshold for "Over 1.5" is too easy compared to higher-conviction picks. Worth inspecting the scoring weights independently — it's not a bug per se but it makes the "Best Pick" feature uninformative.

## Files to touch

| File | Change |
|---|---|
| `supabase/functions/auto-sync/index.ts` | Don't mark `completed` without scores; introduce `unknown` status |
| `supabase/functions/pre-match-predictions/index.ts` | Write `pre_match_snapshot` on first T-60 refresh; cap `prediction_intervals`; clean retry log |
| `supabase/functions/generate-statistical-prediction/index.ts` | Remove placeholder upsert in catch; lazy `compute-features` on miss |
| `supabase/functions/generate-post-match-review/index.ts` | Skip and log when `goals_home IS NULL` |
| `supabase/functions/coverage-alert/index.ts` | Exclude null-score completed matches from "missing reviews" count |
| `src/components/MLReadinessPanel.tsx` | Wrap `Metric` in `React.forwardRef` |
| `src/components/PredictionComparisonCard.tsx` | Show "snapshot will appear at T-60" when missing instead of returning null |
| One-shot SQL | Reset stuck `completed` matches with null scores back to `upcoming` so auto-sync can fetch real result on next quota window |

## Verification after fix

- `select count(*) from matches where status='completed' and goals_home is null and match_date > now() - interval '7 days'` → 0
- `select count(*) from predictions where pre_match_snapshot is not null and match_date > now() - interval '24 hours'` → ≥80% of imminent matches
- `coverage-alert` returns `{missing_predictions: 0, missing_reviews: 0}` consistently
- No `computedPublishStatus`-style undefined errors in `prediction_logs` for 24h
- `MLReadinessPanel` ref warning gone from console

