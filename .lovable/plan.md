# Fix prediction pipeline: leakage, mutability & duplicate paths

This plan addresses the senior ML audit. It is staged so we ship the highest-impact, lowest-risk fixes first (P0 leakage + P1 mutability), then tackle structural cleanups. We are **not** rewriting the architecture into separate packages right now — that is too large a blast radius for this repo. We tighten the existing edge functions instead.

## Goals (in priority order)

1. **P0** Stop temporal leakage: backfilled predictions must never see future data.
2. **P1** Make pre-match predictions immutable once kickoff hits.
3. **P1** Make `compute-features` truly per-match when given a `match_id`.
4. **P1** Stop `sync-football-data` from writing low-fidelity prediction rows.
5. **P1** Fix internal contradiction: 1X2 / xG / goal lines must be derived from the *same* final lambdas.
6. **P2** Stop `football-intelligence` from freezing on the very first run.
7. **P2** Restrict admin/ops triggers from public client pages.

We are **deferring** (out of scope, separate plan): immutable `prediction_runs` table + `current_predictions` view, true replay-based weight validation, Dixon-Coles upgrade, monorepo split, full feature store.

---

## Changes

### 1. P0 — Time-safe historical loads in `generate-statistical-prediction`

`supabase/functions/generate-statistical-prediction/index.ts` lines ~166-200:
- Compute `cutoffIso = as_of ?? match.match_date` **before** the parallel block.
- Add `.lt("match_date", cutoffIso)` to all three history queries:
  - `homeMatches` (line 182-185)
  - `awayMatches` (line 186-189)
  - `leagueMatches` (line 190-193)
- Pass `as_of` through to the inline `compute-features` call (line 208-213) and to `enrich-match-context` / `football-intelligence` whenever called from a backfill context.

In `compute-features/index.ts`:
- Accept `{ match_id, as_of }` in the request body.
- When `match_id` is provided, scope `upcomingMatches` to that single row and apply `match_date < as_of` to the completed-matches query (line 68-74) and to the league averages calculation.

### 2. P1 — Per-match mode for `compute-features`

`supabase/functions/compute-features/index.ts`:
- At the top of the handler, parse `{ match_id?, as_of? }`.
- If `match_id` is set, replace the 500-row scan (line 50-55) with a single `select(...).eq("id", match_id)` lookup, then run the existing logic for just that one match. Today every per-match call recomputes the entire upcoming slate — this is both leaky and slow.

### 3. P1 — Pre-kickoff immutability guard in `generate-ai-prediction`

`supabase/functions/generate-ai-prediction/index.ts` (around line 1158, the `upsert`):
- Before upserting, fetch the existing `predictions` row.
- If `match.match_date <= now()` (kickoff passed) AND the existing row already has `pre_match_snapshot` set, **abort**: return the existing row unchanged. This prevents post-kickoff drift caused by the auto-trigger in `MatchDetail.tsx` line 74-83.
- Also gate the live re-fetch of context (line ~931 region) behind a "still pre-match" check for backfill calls (`backfill: true`).

`src/pages/MatchDetail.tsx` line 74-83:
- Tighten `isIncomplete`: only auto-trigger if `prediction == null` OR (`!prediction.ai_reasoning` AND `match_date > now() - 2h`). Stop auto-firing on completed matches with partial data.

### 4. P1 — Remove fallback prediction writes from `sync-football-data`

`supabase/functions/sync-football-data/index.ts` lines 750-790 (the `mode === "full"` prediction-writing block):
- Delete this block entirely. The richer pipeline (`pre-match-predictions` → `generate-statistical-prediction`) is already triggered by `auto-sync` Step 7 and will populate predictions properly.
- Sync should ingest data only — never write predictions.

### 5. P1 — Fix internal consistency: 1X2 ↔ xG ↔ goal lines

`supabase/functions/generate-statistical-prediction/index.ts`:
- Currently 1X2 (line 408-417) is computed from `lambdaHome`/`lambdaAway`, then lambdas are mutated again at lines ~427-453 (stage, championship regression, relegation), then goal lines are derived from the *new* lambdas (line 474-476). The output row is internally inconsistent.
- Fix: move the entire stage/competition/championship/relegation lambda-adjustment block to **before** the 1X2 Poisson summation. After all lambda mutations are done, compute 1X2, goal lines, distribution, BTTS, and predicted score from the same final pair.
- Keep the post-Poisson calibration deltas (`homeBiasAdj`, `drawCalAdj`, etc.) where they are — those are probability-space corrections, not lambda corrections.

### 6. P2 — Don't freeze on first football-intelligence run

`supabase/functions/football-intelligence/index.ts` ~line 358:
- Only set `frozen_at` when we are within T-2h of kickoff (mirroring the rule we already use in `enrich-match-context`). Earlier runs should leave `frozen_at = null` so later runs can pick up lineups/news.
- Line 37 (skip-if-frozen): keep, but it's now safe because we only freeze at T-2h.

### 7. P2 — Hide ops triggers from public pages

- `src/pages/Index.tsx` (line ~42), `src/pages/Accuracy.tsx` (line ~239), `src/components/MLReadinessPanel.tsx` (line ~67): wrap any button that invokes `auto-sync`, `backfill-*`, `compute-model-performance`, `batch-*` behind a check `subscription?.tier === 'admin'` (or a new `is_admin` flag — simplest: gate by a hardcoded admin user_id list in a shared helper, since this app has no roles table yet).
- Note for the user: a proper `user_roles` table is the right long-term fix; for now we just hide the buttons. Calling the functions directly still works for service-role callers.

---

## Verification (after deploy)

- `select count(*) from predictions p join matches m on m.id=p.match_id where p.training_only=true and (p.feature_snapshot->>'as_of')::timestamptz >= m.match_date` → 0
- Pick any prediction row, run `generate-statistical-prediction` again with `as_of = match_date - 1 day`: the resulting `home_win + draw + away_win` ≈ 1, and `expected_goals_home/away` matches the lambdas used for `goal_lines`.
- `select count(*) from predictions where update_reason='initial' and quality_score < 0.3` (i.e. sync-written fallbacks) stops growing.
- A completed match opened in `MatchDetail` does **not** generate a new `prediction_logs` row.
- `compute-features` invoked with `{match_id}` returns within ~1s and writes exactly one `match_features` row.

## Out of scope (future plan)

- `prediction_runs` immutable history + `current_predictions` view.
- True point-in-time replay for `compute-model-performance` validation.
- Dixon-Coles / bivariate Poisson upgrade and bookmaker-prior blending.
- Repo split into `model-core` / `model-serving` / `model-training` packages.
- Proper `user_roles` table + RLS-enforced admin separation.
