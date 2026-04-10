

# Profile Settings Page

## What changes

Create a `/profile` page where users can edit their display name and upload a custom avatar. Add a link to it from the header dropdown. Create an `avatars` storage bucket for avatar uploads.

## Implementation

### 1. Database: Create `avatars` storage bucket
Migration to create a public `avatars` bucket with RLS policies allowing authenticated users to upload/update/delete their own files (path prefixed by `user_id`).

### 2. New page: `src/pages/Profile.tsx`
- Form with display name input (pre-filled from profiles table)
- Avatar section: current avatar preview + file upload button
- On avatar upload: upload to `avatars/{user_id}/avatar.png`, get public URL, update `profiles.avatar_url`
- On name save: update `profiles.display_name`
- Success/error toasts

### 3. Update `src/components/Header.tsx`
- Add "Profile settings" menu item in the dropdown (both desktop and mobile) linking to `/profile`

### 4. Update `src/App.tsx`
- Add `/profile` route wrapped in `ProtectedRoute`

## Files

| File | Action |
|---|---|
| Migration | Create `avatars` storage bucket + RLS policies |
| `src/pages/Profile.tsx` | New profile settings page |
| `src/components/Header.tsx` | Add profile link to dropdown |
| `src/App.tsx` | Add `/profile` route |

