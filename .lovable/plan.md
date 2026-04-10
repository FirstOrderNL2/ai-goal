

# Phase 3: Leaderboard + Comment Intelligence

## Summary
Add a public Leaderboard page showing top predictors ranked by accuracy, and an AI-powered comment summary on match detail pages that distills community sentiment from user comments.

The A/B model testing framework from the original outline is deferred — it requires significant backend infrastructure and is better addressed separately.

## Part A: Leaderboard Page

### New: `src/pages/Leaderboard.tsx`
A new protected page at `/leaderboard` showing a ranked table of users from the `user_performance` table.

- Columns: Rank, Avatar + Display Name, Tier Badge, Total Votes, Correct Votes, Accuracy %, Trust Score
- Sorted by `trust_score` descending, then `accuracy_score`
- Top 3 users get gold/silver/bronze styling
- Current logged-in user's row is highlighted
- Fetches from `user_performance` joined with `profiles` for display names and avatars
- Shows "No data yet" state when table is empty
- Minimum 5 votes required to appear on the leaderboard (prevents gaming)

### Updated: `src/App.tsx`
- Add route: `/leaderboard` -> `Leaderboard` (protected)

### Updated: `src/components/Header.tsx`
- Add "Leaderboard" nav item with Trophy icon linking to `/leaderboard`

## Part B: AI Comment Summary on Match Detail

### New: `supabase/functions/summarize-comments/index.ts`
An edge function that takes a `prediction_id`, fetches all comments for that prediction, and uses Lovable AI (Gemini Flash) to generate a 2-3 sentence summary of community sentiment.

- Input: `{ prediction_id: string }`
- Fetches comments from `prediction_comments` table
- If fewer than 3 comments, returns null (not enough to summarize)
- Sends comments to Lovable AI Gateway with a prompt: "Summarize the community sentiment about this football prediction in 2-3 sentences. Focus on what fans agree/disagree about."
- Returns `{ summary: string }` or `{ summary: null }`
- Uses `LOVABLE_API_KEY` (already configured)

### New: `src/components/CommentSummaryCard.tsx`
A small card displayed above the comments section showing the AI-generated summary.

- Calls the `summarize-comments` edge function on mount
- Shows a sparkle/brain icon with "Community Pulse" title
- Displays the AI summary text
- Includes a "Refresh" button to regenerate
- Shows skeleton while loading, hides if no summary available
- Caches result in react-query with 5-minute stale time

### Updated: `src/pages/MatchDetail.tsx`
- Insert `CommentSummaryCard` above the `CommentsSection` component
- Pass `predictionId` as prop

## Part C: User Stats on Profile Page

### Updated: `src/pages/Profile.tsx`
- Add a "My Prediction Stats" section showing the user's own `user_performance` data
- Display: Total Votes, Correct Votes, Accuracy %, Trust Score, Tier badge
- Fetched from `user_performance` where `user_id` = current user
- Links to the leaderboard with "View Leaderboard" button

## Files

| File | Action |
|---|---|
| `src/pages/Leaderboard.tsx` | New leaderboard page |
| `src/components/CommentSummaryCard.tsx` | New AI comment summary card |
| `supabase/functions/summarize-comments/index.ts` | New edge function for AI summaries |
| `src/App.tsx` | Add `/leaderboard` route |
| `src/components/Header.tsx` | Add Leaderboard nav link |
| `src/pages/MatchDetail.tsx` | Add CommentSummaryCard |
| `src/pages/Profile.tsx` | Add prediction stats section |
| `.lovable/plan.md` | Update plan to Phase 3 |

No database changes needed — `user_performance` and `profiles` tables already exist with public SELECT policies.

