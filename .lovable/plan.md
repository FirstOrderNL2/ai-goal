

# Comment Likes Feature

## Summary
Add a like (heart/thumbs-up) button on each comment and reply so users can upvote helpful contributions. Requires a new `comment_likes` database table and UI updates to `CommentsSection.tsx`.

## Database Changes

### New Table: `comment_likes`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | default `gen_random_uuid()` |
| comment_id | uuid NOT NULL | references `prediction_comments(id)` on delete cascade |
| user_id | uuid NOT NULL | references `auth.users(id)` on delete cascade |
| created_at | timestamptz | default `now()` |
| **UNIQUE** | (comment_id, user_id) | one like per user per comment |

RLS policies:
- SELECT: authenticated users can view all likes
- INSERT: authenticated users can insert where `auth.uid() = user_id`
- DELETE: authenticated users can delete where `auth.uid() = user_id`

Enable realtime on `comment_likes`.

## Frontend Changes (`CommentsSection.tsx`)

1. **Fetch likes**: After fetching comments, batch-fetch all likes for those comment IDs. Build a map of `comment_id -> { count, likedByMe }`.
2. **Like button**: Add a heart icon button next to the Reply button (and on replies too). Shows like count. Filled/colored heart if current user has liked it.
3. **Toggle logic**: Click to insert a like; click again to delete (unlike). Uses upsert-like pattern with the unique constraint.
4. **Realtime**: Subscribe to `comment_likes` changes to auto-refresh counts.

## Files

| File | Action |
|---|---|
| Migration SQL | Create `comment_likes` table with RLS + realtime |
| `src/components/CommentsSection.tsx` | Add like button, fetch/display like counts, toggle logic |

