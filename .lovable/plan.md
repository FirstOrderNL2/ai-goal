

# Reliability hardening + 100% prediction visibility

## What I found in the audit

- **Coverage:** All 222 upcoming matches in the next 7 days already have a prediction. There is no missing-prediction problem at the generation layer.
- **The real problem:** 10 matches today are hidden because `publish_status='low_quality'` — every one of them is in a newly-added league (Super League 1, HNL, Ukraine PL, Superliga, Bundesliga AT) with `data_quality ∈ {0, 0.25}` because `team_statistics` for those leagues haven't been backfilled yet. The publish gate kills them even though a prediction exists.
- **Cadence:** `pre-match-predictions` already runs every 10 min and covers Phase A (initial), Phase B (T-60 refresh, 9-min cooldown), Phase C (HT snapshot). Auto-sync runs every 4 h.
- **Missing observability:** no `prediction_logs` table, no per-match status (`pending|success|failed`), no retry tracking, no surfaced metrics on the Accuracy page.

The plan below is scoped to what is actually broken and what unlocks the user's stated goal: **every match visibly predicted before kickoff, with self-healing + observability**. I am intentionally not building a separate `ensure-predictions` watchdog — `pre-match-predictions` already does that job; I'll harden it instead.

---

## Changes

### 1. Visibility — show predictions for new-league matches (the user's core complaint)

**`supabase/functions/generate-statistical-prediction/index.ts`**
- When `data_quality < 0.30`, instead of stamping `low_quality`, publish with `data_quality = "partial"` flag in `feature_snapshot`, cap `model_confidence` at 0.40, and prepend `⚠️ Limited stats — early signal only` to `ai_reasoning`. This matches what we already do for the 0.30–0.45 soft band.
- Keep `low_quality` only for the genuinely broken case: `leagueRelFactor < 0.50` **or** missing both team IDs.

**One-shot SQL update:** flip the 10 currently-hidden `low_quality` rows to `published` (with capped confidence + caveat) so today's matches surface immediately.

### 2. Self-healing — retry + status tracking on the predictions table

**Migration:** add to `predictions`:
- `generation_status text default 'success'` — `pending | success | failed | partial`
- `retry_count int default 0`
- `last_error text`
- `update_reason text` — `initial | recheck_60 | recheck_30 | recheck_10 | ht | manual`

**`generate-statistical-prediction`:** wrap the main pipeline in try/catch. On failure, upsert a row with `generation_status='failed'`, `last_error`, `retry_count++`. On success set `generation_status` to `success` or `partial`. Stamp `update_reason` from the request body (default `initial`).

### 3. Tighter recheck windows + dependency readiness

**`supabase/functions/pre-match-predictions/index.ts`** — Phase B currently uses one window (T-60) with a 9-min cooldown. Replace with explicit checkpoints:
- T-60, T-30, T-15, T-10, T-5 (skip if already refreshed in the matching window).
- Before each refresh, do a fast readiness probe: `match_features` row exists? If not, call `compute-features` first, then proceed regardless (fallback mode → `data_quality='partial'`).
- On failure, increment `retry_count` (max 3 with exponential backoff handled inside the same loop tick: 0s → 5s → 15s).

Also raise the per-tick caps: `needsInitialPrediction` 15→30, Phase B refresh 5→10. The function easily fits in the 10-min cron window.

### 4. Watchdog safety net (lightweight — no new function)

Add a Phase D to `pre-match-predictions`: any upcoming match in the next 24h with `generation_status IN ('failed','pending')` AND `retry_count < 3` → re-queue immediately. This is the "no match without a prediction" guarantee, but reuses existing infra.

### 5. Observability

**Migration:** new `prediction_logs` table:
```
id uuid pk, match_id uuid, action text, status text, error text,
update_reason text, latency_ms int, created_at timestamptz default now()
```
RLS: public SELECT (it's operational data, no PII).

Both `generate-statistical-prediction` and `pre-match-predictions` write one row per attempt: `action ∈ {generate, recheck, ht_snapshot, retry}`.

### 6. Accuracy dashboard — pipeline health card

**`src/pages/Accuracy.tsx`**: add a "Prediction Pipeline Health" card showing live metrics from `prediction_logs` + `predictions`:
- % of next-24h matches with `generation_status='success'`
- Failure rate (last 24h)
- Avg prediction freshness (minutes since `last_prediction_at`) for matches starting in <60 min
- Count of matches in `partial` mode (new leagues)

### 7. Backfill team_statistics for new leagues (root cause of `data_quality=0`)

One-shot trigger of `auto-sync` with `mode:"full"` after deploy. Standing fix already in place via the 4-hourly cron — this just accelerates it for the 14 new leagues added last session.

### 8. Frontend visibility audit (`src/hooks/useMatches.ts`)

Filter logic is correct (`training_only=false AND publish_status='published'`). No change needed once the `low_quality` rows are flipped. I'll add one defensive log so future hidden predictions are visible in console during dev.

---

## Files touched

- `supabase/functions/generate-statistical-prediction/index.ts` — partial-mode publishing + status tracking + log writes
- `supabase/functions/pre-match-predictions/index.ts` — explicit T-60/30/15/10/5 windows, Phase D watchdog, readiness probe, retry+backoff
- `src/pages/Accuracy.tsx` — Pipeline Health card
- `src/hooks/useMatches.ts` — defensive console warning for hidden preds
- Migration: add columns to `predictions`, create `prediction_logs` + RLS
- One-shot UPDATE on existing `low_quality` rows
- One-shot invocation of `auto-sync` with `mode:"full"`

## Out of scope

- New `ensure-predictions` edge function — `pre-match-predictions` already does this; adding another would just compete for the cron slot.
- Changing the AI prediction path (`generate-ai-prediction`) — it already inherits the published flag from the statistical pass after the previous fix.
- ML weight changes / model retraining.

## Success criteria (verifiable)

- 0 upcoming matches with `publish_status='low_quality'` in the next 24h after deploy.
- Today's Greek SL1, HNL, Ukraine, Superliga, Bundesliga AT matches show AI Verdict + probability bars on `/dashboard`.
- `prediction_logs` table populating with at least one row per match per cron tick.
- `/accuracy` shows ≥ 99% pipeline success rate.
- Within 10 min of any failure, automatic retry visible in `prediction_logs`.

