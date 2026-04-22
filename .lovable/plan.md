

# Surface hidden predictions for Telstar, Panserraikos, and similar matches

## What's wrong

Both matches **already have predictions** stored in the database, but `useMatches.ts` filters them out because their `publish_status = 'low_quality'`:

- **Telstar (Eredivisie)**: quality is actually high (0.87) — flag is stale because `generate-ai-prediction` updates the row without recomputing `publish_status`.
- **Panserraikos (Greek SL1)**: `data_quality = 0` because `team_statistics` haven't backfilled for the 14 newly-added leagues yet.

You want both visible. Plan does two things: unfreeze stale flags, and let new-league matches publish with a "limited stats" caveat instead of being hidden.

## Changes

### 1. `supabase/functions/generate-ai-prediction/index.ts`
Add `publish_status` and `quality_score` to the prediction upsert payload, recomputed inline from current `dataQuality`, `leagueRelFactor`, and `blendedConfidence`. Fixes the Telstar-style "stuck low_quality" cases — the moment a stats refresh runs, the flag updates.

### 2. `supabase/functions/generate-statistical-prediction/index.ts`
Soften the publish gate so new-league matches surface:
- Hard hide only when `dataQuality < 0.30` (was 0.45).
- Soft band `0.30 ≤ dataQuality < 0.45`: publish, cap `model_confidence` at 0.45, prepend "Limited stats — early signal only" to `ai_reasoning`.
- Lower confidence floor from 0.35 → 0.30. Keep `leagueRelFactor < 0.75` gate.

### 3. One-shot SQL update (via insert tool, not a migration)
Re-evaluate every existing `publish_status='low_quality'` row using its stored `feature_snapshot`. Flip to `'published'` where the new gate passes. Pure data update — Telstar surfaces immediately without waiting for the next AI run.

### 4. Trigger `auto-sync` once with `mode: "full"` after deploy
Backfills `team_statistics` for the 14 newly-added leagues so Greek/Turkish/Portuguese matches get real `data_quality` instead of zero on the next prediction run.

## Files touched

- `supabase/functions/generate-ai-prediction/index.ts`
- `supabase/functions/generate-statistical-prediction/index.ts`
- One-shot UPDATE on `predictions` (insert tool)
- One-shot invocation of `auto-sync` (no code change)

## Out of scope

- No UI changes — `useMatches.ts` filter stays as-is. Once `publish_status='published'`, AI Verdict, Probabilities, Over/Under render automatically.
- No change to `training_only` semantics.
- No model accuracy threshold changes.

## Success criteria

- `/en/match/add8ae22-…` (Telstar): AI Verdict + probability bars visible within 30 s.
- `/en/match/ae23d789-…` (Panserraikos): visible with capped confidence ≤ 45% and "Limited stats" caveat.
- New top-flight European fixtures (Süper Lig, Primeira, etc.) display predictions within ~30 min of next sync.

