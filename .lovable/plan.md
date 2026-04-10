

# User Profile Dropdown in Header

## What changes

Replace the standalone LogOut button in the header with an avatar-based dropdown menu that shows the user's name, email, and avatar (from the `profiles` table or auth metadata), plus theme toggle and sign-out options.

## Implementation

### 1. Header.tsx
- Import `Avatar`, `AvatarImage`, `AvatarFallback` from UI components
- Import `DropdownMenu`, `DropdownMenuTrigger`, `DropdownMenuContent`, `DropdownMenuItem`, `DropdownMenuSeparator`, `DropdownMenuLabel`
- Read `user` from `useAuth()` 
- Query `profiles` table for `display_name` and `avatar_url` using `useEffect` + `supabase.from('profiles').select(...)` filtered by `user.id`
- Replace the LogOut button (desktop) with a `DropdownMenu` triggered by an `Avatar` showing the user's photo (fallback: initials from display_name or email)
- Dropdown content: user name + email label, separator, theme toggle item, separator, sign out item (red text)
- In mobile menu: add user info row at top + sign out button at bottom

### Files modified
| File | Change |
|---|---|
| `src/components/Header.tsx` | Add avatar dropdown with profile data, replace bare LogOut button |

No database or backend changes needed — profiles table and auth already exist.

