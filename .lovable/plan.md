

# Threaded Replies for Comments

## Database Change

Add a nullable `parent_id` column to `prediction_comments` that self-references the same table. This enables one level of nesting (replies to top-level comments).

**Migration SQL:**
- `ALTER TABLE prediction_comments ADD COLUMN parent_id uuid REFERENCES prediction_comments(id) ON DELETE CASCADE DEFAULT NULL;`

## Frontend Changes (`CommentsSection.tsx`)

1. **Data model**: Add `parent_id` and `replies` to the `Comment` interface.
2. **Fetch logic**: Fetch all comments (including `parent_id`), then build a tree client-side — group replies under their parent. Top-level comments have `parent_id = null`.
3. **Reply UI**: Add a "Reply" button on each top-level comment. When clicked, show an inline reply input below that comment. Insert with `parent_id` set.
4. **Rendering**: Render top-level comments first, then indented replies beneath each one (single nesting level). Replies are visually indented with a left border.
5. **Count**: Discussion count reflects total comments (top-level + replies).

## Files

| File | Action |
|---|---|
| Migration SQL | Add `parent_id` column to `prediction_comments` |
| `src/components/CommentsSection.tsx` | Add reply button, inline reply input, nested rendering |

