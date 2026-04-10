

# Phase 2: Confidence Engine 2.0 + Hot Match Detection

## Summary
Create a unified Confidence 2.0 score on the match detail page that blends statistical certainty, data quality, community alignment, and volatility. Add a "Hot Matches" section to the dashboard highlighting high-engagement or high-disagreement matches.

## Part A: Confidence Engine 2.0 Component

### New: `src/components/ConfidenceEngineCard.tsx`
A card displayed on `MatchDetail.tsx` (after the AI Verdict) showing a composite confidence score broken into 4 pillars:

| Pillar | Weight | Source | Calculation |
|---|---|---|---|
| Statistical Certainty | 40% | `prediction` | Gap between top probability and second-highest (stronger gap = higher certainty) |
| Data Quality | 20% | `features`, `matchContext` | Completeness score: has lineups, h2h, form, injuries, referee data |
| Community Alignment | 20% | `prediction_votes` + `user_performance` | Weighted agreement between AI pick and community weighted sentiment |
| Volatility Adjustment | 20% | `match_features.volatility_score` | Inverse of volatility (low volatility = higher confidence) |

**Formula**: `confidence_2 = (stat * 0.4) + (quality * 0.2) + (alignment * 0.2) + ((1 - volatility) * 0.2)`

**UI**: Circular or segmented gauge showing overall score (0-100%), with a breakdown showing each pillar's contribution. Color-coded: Green (70%+), Yellow (40-69%), Red (<40%).

### Updated: `src/pages/MatchDetail.tsx`
- Insert `ConfidenceEngineCard` after the AI Verdict section
- Pass `prediction`, `features`, `matchContext`, and match ID as props

## Part B: Hot Match Detection on Dashboard

### New: `src/components/HotMatchBadge.tsx`
A small flame badge component that renders on `MatchCard` when a match qualifies as "hot".

### Updated: `src/hooks/useMatches.ts`
- In `enrichMatches`, also fetch `prediction_votes` counts and `match_features.volatility_score` for upcoming matches
- Compute a `hotScore` per match based on:
  - Vote count (engagement)
  - Like/dislike ratio divergence (disagreement)
  - Volatility score
- Attach `hotScore` to the enriched match object

### Updated: `src/lib/types.ts`
- Add optional `hotScore?: number` to the `Match` type

### Updated: `src/components/MatchCard.tsx`
- Show `HotMatchBadge` (flame icon + "Hot") when `match.hotScore` exceeds threshold

### Updated: `src/pages/Index.tsx`
- Add a new "Trending Matches" section before Upcoming, showing matches sorted by hotScore (top 3-6)
- Only renders if there are hot matches

## Files

| File | Action |
|---|---|
| `src/components/ConfidenceEngineCard.tsx` | New composite confidence card |
| `src/components/HotMatchBadge.tsx` | New flame badge component |
| `src/pages/MatchDetail.tsx` | Add ConfidenceEngineCard |
| `src/hooks/useMatches.ts` | Enrich with vote counts + hotScore |
| `src/lib/types.ts` | Add hotScore field |
| `src/components/MatchCard.tsx` | Show hot badge |
| `src/pages/Index.tsx` | Add Trending Matches section |

No database changes needed — all data already exists in `prediction_votes`, `match_features`, `match_context`, and `predictions`.

