

# GoalGPT Homepage & Rebrand Implementation

## Summary
Create a new public landing page at `/` that markets GoalGPT to visitors, rebrand from "FootballAI" to "GoalGPT", and move the authenticated dashboard to `/dashboard`.

## Routing Changes (`src/App.tsx`)
- Add new public route: `/ → Landing` (no auth required)
- Move current Index (dashboard) to `/dashboard` (protected)
- Add new `Landing.tsx` page import
- Update Login redirect to `/dashboard` after sign-in

## New File: `src/pages/Landing.tsx`
A full marketing homepage with these sections, all in one file:

1. **Hero** — Bold headline "Why gamble... when you can predict with intelligence?", subheadline, two CTA buttons (Create Free Account links to `/login`, View Predictions links to `/login`), animated gradient background with subtle grid pattern
2. **Value Explanation** — "Stop guessing. Start understanding." with 4 icon cards (Historical data, Trends, AI engine, Live insights)
3. **How It Works** — 5-step vertical timeline with numbered steps and icons
4. **Features** — "Why GoalGPT is different" with 4 feature cards (AI + Stats, Transparent, Smart Insights, Community)
5. **Example Insight** — Mock prediction card showing Bayern vs Real Madrid example with probability bars
6. **Trust & Disclaimer** — Clear, professional notice about predictions being informational only
7. **Final CTA** — "Ready to stop guessing?" with signup buttons
8. **Footer** — Links, disclaimer repeat, copyright

Design: Uses existing dark theme CSS variables. Green neon accent (already `--primary`). Glassmorphism cards, subtle animations via Tailwind.

## Rebrand Updates
- **`src/components/Header.tsx`**: Change "FootballAI" → "GoalGPT" in logo text
- **`src/pages/Login.tsx`**: Change "FootballAI" → "GoalGPT" in card header
- **`index.html`**: Update `<title>` to "GoalGPT"

## Updated: `src/pages/Login.tsx`
- Redirect authenticated users to `/dashboard` instead of `/`
- Update branding text

## Files

| File | Action |
|---|---|
| `src/pages/Landing.tsx` | New public marketing homepage |
| `src/App.tsx` | Add `/` landing route, move dashboard to `/dashboard` |
| `src/components/Header.tsx` | Rebrand to GoalGPT |
| `src/pages/Login.tsx` | Rebrand + redirect to `/dashboard` |
| `index.html` | Update page title |

No database changes needed.

