

# Focus on 20 Upcoming Matches + Auto-Learning AI

## Two Changes

### 1. Limit Homepage to Next 20 Upcoming Matches

Currently the Index page fetches ALL upcoming matches (potentially hundreds across 8 competitions). This is slow and overwhelming.

**Changes:**
- `src/hooks/useMatches.ts` — Add `.limit(20)` to the upcoming matches query
- `src/pages/Index.tsx` — Show a "View All" link if there are more matches; also limit completed to 12

### 2. Automated AI Learning Loop

Currently the AI learns from past reviews only when a user manually clicks "Generate Review" on each completed match. To make this automatic:

**Create a new edge function `supabase/functions/auto-review-matches/index.ts`** that:
1. Finds the 5 most recent completed matches that have `ai_insights` (a pre-match prediction was made) but no `ai_post_match_review` yet
2. For each, calls `generate-post-match-review` internally to score the prediction vs actual result
3. Stores the accuracy score and review — these are then automatically picked up as learning context by `generate-ai-prediction` (which already reads `ai_post_match_review` and `ai_accuracy_score` from the last 10 reviewed matches)

**Trigger it automatically** by calling this function after each sync completes (in `src/hooks/useSportradar.ts` or `src/pages/Index.tsx`).

This closes the feedback loop: Sync → New results arrive → Auto-review scores past predictions → Future predictions incorporate those lessons.

**Also create `supabase/functions/auto-predict-upcoming/index.ts`** that:
1. Finds upcoming matches within the next 7 days that have no `ai_insights` yet
2. Calls `generate-ai-prediction` for each (with rate-limit delays between calls)
3. Ensures every upcoming match has a prediction before the user even opens it

**Frontend integration:**
- After sync completes successfully, call `auto-review-matches` then `auto-predict-upcoming` in sequence
- Show a subtle toast: "AI analyzing matches..."
- Add a small indicator on the Index page showing AI learning status (e.g., "AI has reviewed X matches, avg accuracy: Y%")

## Files Changed

| File | Change |
|---|---|
| `src/hooks/useMatches.ts` | Add `.limit(20)` to upcoming query |
| `src/pages/Index.tsx` | Show count, add "View All" link, trigger auto-review/predict after sync |
| `supabase/functions/auto-review-matches/index.ts` | New: auto-review completed matches that had predictions |
| `supabase/functions/auto-predict-upcoming/index.ts` | New: auto-generate AI insights for upcoming matches within 7 days |
| `src/hooks/useSportradar.ts` | Chain auto-review + auto-predict after sync success |

No database changes needed.

