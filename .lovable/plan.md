

# Community Layer — Phase 1 (MVP) Implementation Plan

## Summary
Add a like/dislike voting system and comment section to each match prediction page, leveraging the existing authentication system (email, Google, Apple sign-in already implemented).

## What Already Exists
- Authentication: login/signup with email, Google, Apple — fully working
- Profiles table with `user_id`, `display_name`, `avatar_url`
- Protected routes via `ProtectedRoute` component
- Match detail page at `/match/:id` with prediction display

## Database Changes (2 new tables + realtime)

### Table: `prediction_votes`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | default `gen_random_uuid()` |
| prediction_id | uuid NOT NULL | references `predictions(id)` |
| user_id | uuid NOT NULL | references `auth.users(id)` on delete cascade |
| vote_type | text NOT NULL | `'like'` or `'dislike'` |
| created_at | timestamptz | default `now()` |
| **UNIQUE** | (prediction_id, user_id) | one vote per user per prediction |

RLS: authenticated users can SELECT all votes, INSERT/UPDATE/DELETE own votes only.

### Table: `prediction_comments`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | default `gen_random_uuid()` |
| prediction_id | uuid NOT NULL | references `predictions(id)` |
| user_id | uuid NOT NULL | references `auth.users(id)` on delete cascade |
| comment | text NOT NULL | max 1000 chars enforced client-side |
| created_at | timestamptz | default `now()` |

RLS: anyone authenticated can SELECT all comments, INSERT own comments, DELETE own comments.

Enable realtime on both tables for live updates.

## Frontend Changes

### New Component: `CommunityVoteBar.tsx`
- Thumbs up / thumbs down buttons with counts
- Community confidence percentage: `likes / (likes + dislikes)`
- Sentiment indicator (green/yellow/red)
- Fetches votes via `supabase.from('prediction_votes')`, upserts on click
- Disabled state for logged-out users (handled by auth)

### New Component: `CommentsSection.tsx`
- List of comments with user avatar, display name, timestamp
- Text input to add a comment (authenticated only)
- Sort by newest first
- Delete own comments
- Joins `profiles` table for display info

### Updated: `MatchDetail.tsx`
- Add `CommunityVoteBar` below the AI prediction section
- Add `CommentsSection` below the community vote bar
- Both components receive `prediction_id` as a prop

## Files

| File | Action |
|---|---|
| Migration SQL | Create `prediction_votes` + `prediction_comments` tables with RLS + realtime |
| `src/components/CommunityVoteBar.tsx` | New — vote buttons + community score |
| `src/components/CommentsSection.tsx` | New — comment list + input |
| `src/pages/MatchDetail.tsx` | Add both new components |

## Out of Scope (Phase 2+)
- Threaded replies
- Comment likes
- AI vs Community comparison panel
- Moderation/report system
- Profanity filter
- Analytics tracking

