

## Fix: Mobile Header on Landing Page

The issue is that all nav items (logo, language switcher, Sign In, Create Free Account) are in a single row, which overflows on small screens (~411px wide).

### Changes

**`src/pages/Landing.tsx`** — Restructure the header for mobile:
- Hide the "Sign In" text button on small screens (`hidden sm:inline-flex`)
- Shorten the CTA button text on mobile: show just "Sign Up" instead of "Create Free Account" on small screens
- Reduce spacing between items on mobile (`gap-1 sm:gap-2`)
- Make the language switcher more compact on mobile (icon-only, no text label below `sm`)

**`src/components/LanguageSwitcher.tsx`** — Make the label responsive:
- Show just the language code without the Globe icon on very small screens, or make the button more compact with smaller padding

### Result
The header will fit cleanly on 411px-wide screens: Logo | [globe] DE | Sign Up — with the full desktop layout preserved on wider screens.

