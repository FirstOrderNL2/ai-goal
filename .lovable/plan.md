

# AI vs Crowd Intelligence System — Phased Implementation Plan

This is a large initiative. I recommend breaking it into 3 focused phases, implementing Phase 1 first.

## Phase 1: User Performance Tracking + Smart Community Score (this approval)

### 1A. Database: `user_performance` table

New table tracking each user's voting accuracy:

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid NOT NULL UNIQUE | references auth.users |
| total_votes | integer | default 0 |
| correct_votes | integer | default 0 |
| accuracy_score | numeric | 0-1, default 0 |
| trust_score | numeric | weighted metric, default 0.5 |
| tier | text | 'pro' / 'average' / 'low', default 'low' |
| last_updated | timestamptz | default now() |

RLS: public SELECT, authenticated INSERT/UPDATE on own row.

### 1B. Edge Function: `compute-user-performance`

Batch job that runs after match reviews are computed:
- For each user with votes on completed matches, check if the prediction they liked/disliked was correct
- Calculate accuracy_score = correct_votes / total_votes
- Calculate trust_score using the weighted formula (60% accuracy, 20% volume, 20% consistency)
- Set tier based on accuracy thresholds

### 1C. Weighted Community Score in `AICommunityComparisonCard`

Replace the simple like-ratio with a trust-weighted score:
- Fetch voter trust_scores alongside votes
- Compute: `weighted_score = sum(vote * trust_score) / sum(trust_score)`
- Display the weighted community confidence instead of raw percentage
- Show "Weighted by user accuracy" label

### 1D. User Performance Badge on Comments

In `CommentsSection.tsx`, show a small colored badge next to usernames:
- 🟢 Pro (70%+), 🟡 Average (50-70%), 🔴 New/Low (<50%)
- Fetched via a join on `user_performance` when loading comments

### 1E. Value Bet Detection Card

New `ValueBetCard.tsx` component on the match detail page:
- Compare AI model probabilities vs bookmaker implied probabilities (already partially shown in Odds section)
- Calculate: `value = model_probability - implied_probability`
- Display value picks with labels: 🔥 High Value (>10%), ⚠️ Marginal (5-10%), ❌ No Value (<5%)
- Include community agreement indicator

## Phase 2 (future): Confidence Engine 2.0 + Hot Match Detection
- Blend statistical confidence, community alignment, data quality, and volatility into a unified score
- Hot/trending match badges on dashboard based on engagement + disagreement

## Phase 3 (future): Leaderboard + Comment Intelligence + Experiment System
- User leaderboard page showing top predictors
- AI-generated comment summaries
- A/B model testing framework

## Files for Phase 1

| File | Action |
|---|---|
| Migration SQL | Create `user_performance` table with RLS |
| `supabase/functions/compute-user-performance/index.ts` | New edge function for batch accuracy computation |
| `src/components/AICommunityComparisonCard.tsx` | Add weighted community score logic |
| `src/components/CommentsSection.tsx` | Add user tier badges next to usernames |
| `src/components/ValueBetCard.tsx` | New value bet detection card |
| `src/pages/MatchDetail.tsx` | Add ValueBetCard to layout |

## Technical Notes
- The `compute-user-performance` function reuses the existing `prediction_reviews` table to determine if predictions were correct
- Trust scores default to 0.5 for new users so they still contribute to weighted scores
- The value bet card leverages existing `odds` data already fetched on the match detail page

