

# Fix: AI prediction overwrites publish gate too strictly, hiding valid matches

## Root cause

`generate-ai-prediction/index.ts` (lines 1127–1145) has its own **stricter** publish gate that overwrites the one from `generate-statistical-prediction`. For HNK Gorica vs Vukovar (HNL):

- Statistical pass: `data_quality=0.475`, `league_reliability=0.85`, `confidence=0.338` → **published** ✅
- AI pass runs after, recomputes `blendedConfidence ≈ 0.28` (drops below 0.30 because predictionCertainty is low when max prob ≈ 38%) → **stamps `low_quality`** ❌

Three concrete bugs in the AI gate:

1. **Stricter `blendedConfidence < 0.30` floor** that the statistical gate doesn't have. Any match where the model is uncertain (close 3-way race) gets killed even with good data.
2. **Stricter `leagueRelFactor < 0.75`** vs statistical's `< 0.50`. Auto-kills Championship-tier and below.
3. **Hardcoded league reliability table** drifting out of sync with `generate-statistical-prediction`'s authoritative table — every league not listed silently defaults to 0.85 (works by luck, but invites future regressions).

The statistical function's gate (line 638) is the correct one. The AI function should **mirror it exactly**, not invent its own.

## Fix

### `supabase/functions/generate-ai-prediction/index.ts` (lines 1127–1148)

Replace the AI-side publish gate with the **same** logic as `generate-statistical-prediction` P6:

```ts
const isSoftBand = dataQuality >= 0.30 && dataQuality < 0.45;
const isPartial  = dataQuality < 0.30;
const isBroken   = leagueRelFactor < 0.50 || (!match.team_home_id && !match.team_away_id);
const publishStatus = isBroken ? "low_quality" : "published";

// Cap confidence so UI doesn't overstate when data is thin (matches statistical pass)
if (isSoftBand && publishStatus === "published") {
  blendedConfidence = Math.min(blendedConfidence, 0.45);
}
if (isPartial && publishStatus === "published") {
  blendedConfidence = Math.min(blendedConfidence, 0.40);
}
```

Drop the `blendedConfidence < 0.30` and `leagueRelFactor < 0.75` clauses entirely — they're not in the statistical gate and they're what's incorrectly hiding this match.

### Also: import the shared league reliability table instead of hardcoding it

Read it from the same source `generate-statistical-prediction` uses (or pull both into a small shared helper file `supabase/functions/_shared/publish-gate.ts`). Pragmatic approach: extract the table + gate into one shared module both functions import. Eliminates drift permanently.

### One-shot SQL update

Re-publish currently-hidden upcoming matches that pass the corrected gate (today only the HNL match qualifies, but it'll keep working as new ones surface):

```sql
UPDATE predictions
SET publish_status='published',
    model_confidence=LEAST(model_confidence, 0.45),
    update_reason='gate_fix'
WHERE publish_status='low_quality'
  AND training_only=false
  AND (feature_snapshot->>'data_quality')::numeric >= 0.30
  AND (feature_snapshot->>'league_reliability')::numeric >= 0.50
  AND match_id IN (SELECT id FROM matches WHERE match_date > now());
```

### Console warning cleanup

The dev-only `console.warn` in `useMatches.ts` from the last pass should now stay quiet for valid predictions — leave it as-is to catch future regressions.

## Files touched

- `supabase/functions/generate-ai-prediction/index.ts` — replace gate (lines 1127–1148) with statistical-aligned version
- New `supabase/functions/_shared/publish-gate.ts` — single source of truth for `leagueReliabilityTable` and `computePublishGate({dataQuality, leagueRelFactor, hasAnyTeamId, blendedConfidence})`
- `supabase/functions/generate-statistical-prediction/index.ts` — refactor P6 to call the shared helper (no behaviour change, prevents future drift)
- One-shot UPDATE on `predictions`

## Out of scope

- No change to confidence thresholds elsewhere, no UI changes — once `publish_status='published'`, the existing `MatchDetail` rendering renders AI Verdict, probabilities, BTTS/OU automatically.
- No new edge function, no schema change.

## Success criteria

- `/en/match/aca999dc-…` (HNK Gorica vs Vukovar) shows AI Verdict + probability bars within 30s of deploy (capped at 45% confidence with "Limited stats" caveat since `data_quality=0.475` is in soft band).
- Both edge functions write identical `publish_status` for the same match — no more silent overrides.
- Next 24h hidden count drops from 1 → 0 immediately; new mismatches surface only when truly broken (`leagueRelFactor < 0.50` or both teams missing).

