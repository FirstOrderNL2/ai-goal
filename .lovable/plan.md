

# AI vs Community Comparison Panel

## Summary
Add a new `AICommunityComparisonCard` component that visually compares the AI prediction outcome with community voting sentiment, highlighting agreement or disagreement.

## Implementation

### New Component: `src/components/AICommunityComparisonCard.tsx`
- Accepts `predictionId`, `prediction` (AI data), `homeTeamName`, `awayTeamName`
- Fetches votes from `prediction_votes` table (reuses same query pattern as `CommunityVoteBar`)
- Displays a side-by-side comparison table:

| Metric | AI | Community |
|---|---|---|
| Winner prediction | e.g. "Home Win (65%)" | "👍 72% support" or "👎 28% against" |
| Confidence | Model confidence % with tier label | Community confidence % with sentiment label |
| Predicted Score | "2 - 1" | N/A (—) |
| Sentiment | Neutral (derived from confidence tier) | Green/Yellow/Red indicator |
| Agreement | Colspan badge: "✅ Aligned" or "⚠️ Divergent" |

- Agreement logic: if community confidence ≥ 50% (majority likes), AI and community agree; if < 50%, they diverge
- Visual: green glow border when aligned, amber when divergent
- Subscribes to realtime votes channel for live updates

### Updated: `src/pages/MatchDetail.tsx`
- Insert `AICommunityComparisonCard` after the `CommunityVoteBar` section (before the Discussion section)
- Only renders when prediction exists and there are votes (total > 0)

## Files

| File | Action |
|---|---|
| `src/components/AICommunityComparisonCard.tsx` | New comparison panel |
| `src/pages/MatchDetail.tsx` | Add component after community vote bar |

No database changes needed — reads existing `prediction_votes` table.

