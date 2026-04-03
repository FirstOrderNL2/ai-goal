
Goal: fix the missing Championship fixtures and upgrade predictions from a single Over/Under 2.5 output to full multi-goal-line probabilities.

What the full check found
- The frontend filter already includes `Championship`, and the sync function already includes API-Football league `40`.
- The database currently has:
  - a `Championship` league row
  - 18 `Championship` teams
  - but 0 `Championship` rows in `matches`, `predictions`, `match_features`, and `match_context`
- There are also 7 legacy teams still stored under `Football League Championship`, including clubs from your screenshot. Some of those legacy rows still have missing API IDs.
- So the problem is not the filter UI. The Championship fixture data is not making it into `matches`, and team naming is split across old and new records.
- Separate dashboard issue: the homepage query limits upcoming matches too early, so smaller leagues can still disappear from “All Leagues” even after sync is fixed.
- Note: the app currently uses `/match/:id`, not `/match/:slug`, so I’ll enhance that existing detail page path.

Implementation plan

1. Repair Championship syncing and data mapping
- Extend the sync alias mapping for Championship naming variants such as:
  - `Leicester` / `Leicester City`
  - `Preston` / `Preston North End`
  - `Derby` / `Derby County`
  - `Coventry` / `Coventry City`
- Update `sync-football-data` so team UUID mapping is built from all league fixture team API IDs, not only newly inserted teams.
- Add per-league sync diagnostics for:
  - fetched fixtures
  - mapped teams
  - skipped fixtures
  - inserted/updated matches
- Create a cleanup migration to merge legacy `Football League Championship` team rows into canonical `Championship` rows before re-running sync.
- Backfill Championship fixtures after the mapping fix.

2. Fix dashboard visibility
- Update `useUpcomingMatches` so “All Leagues” does not cap results at 50 before filtering/deduping.
- Keep exact filtering for a selected league, but fetch a larger result window or paginate so Championship fixtures are not crowded out by bigger leagues.
- Preserve the existing covered-league dedupe rule so only canonical API-Football rows show for supported leagues.

3. Add structured multi-goal-line prediction storage
- Add a migration for new prediction fields, for example:
  - `goal_lines jsonb`
  - `goal_distribution jsonb`
  - `best_pick text`
  - `best_pick_confidence numeric`
  - `best_value_pick text` when odds exist
- Keep `over_under_25` for backward compatibility and derive it from the new goal-line payload.
- Let generated backend types refresh automatically; do not manually edit generated integration files.

4. Upgrade the prediction engine math
- Replace the current single-line goal logic with full Poisson total-goals probabilities using `lambda_home` and `lambda_away`.
- Compute:
  - Over/Under 0.5
  - Over/Under 1.5
  - Over/Under 2.5
  - Over/Under 3.5
  - Over/Under 4.5
  - full 0–5+ total-goal distribution
- Add validation rules so:
  - each over/under pair sums correctly
  - higher over lines decrease monotonically
  - outputs stay realistic based on sane expected-goals inputs

5. Update all prediction writers
- Keep every producer consistent with the new schema:
  - `supabase/functions/generate-ai-prediction/index.ts`
  - `supabase/functions/batch-generate-predictions/index.ts`
  - `supabase/functions/sync-football-data/index.ts`
  - `supabase/functions/sync-sportradar-data/index.ts`
- This avoids mixed rows where some predictions only have 2.5 and others have the full goal-line set.

6. Enhance AI reasoning and recommendations
- Extend the AI tool output to include:
  - `goal_lines`
  - `best_pick`
  - `confidence`
  - value-oriented pick when odds are available
- Update prompting so the AI explains:
  - strongest goal-line probability
  - safest line
  - best value line if market odds disagree
- Keep current 1X2, BTTS, expected scoreline, and confidence outputs intact.

7. Upgrade the match detail page
- Replace the current `OverUnderCard` with a multi-line goal-market card that shows all thresholds clearly.
- Highlight:
  - strongest prediction
  - safe bet
  - higher-risk line
  - best value line if odds exist
- Update `AIVerdictCard`, `MatchCard`, and `MatchDetail` so the UI no longer depends only on `O2.5/U2.5`.
- Add fallback handling for older prediction rows that do not yet have `goal_lines`.
- If the page opens and prediction data is missing or stale, regenerate/refetch so the detail page stays populated.

Files most likely to change
- `supabase/functions/sync-football-data/index.ts`
- `supabase/functions/generate-ai-prediction/index.ts`
- `supabase/functions/batch-generate-predictions/index.ts`
- `supabase/functions/sync-sportradar-data/index.ts`
- `supabase/migrations/*`
- `src/hooks/useMatches.ts`
- `src/lib/types.ts`
- `src/components/OverUnderCard.tsx`
- `src/components/AIVerdictCard.tsx`
- `src/components/MatchCard.tsx`
- `src/pages/MatchDetail.tsx`

Verification checklist
- Championship filter shows fixtures for clubs like Middlesbrough, Millwall, Leicester, Preston, Oxford, and Hull.
- “All Leagues” can surface Championship matches after the query fix.
- Covered leagues still do not show duplicate matches.
- Goal-line probabilities are mathematically valid and monotonic.
- Match detail page shows all goal thresholds, strongest pick, and correct fallback behavior for older predictions.
