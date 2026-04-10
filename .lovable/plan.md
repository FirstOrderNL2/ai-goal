

# Multilingual System for GoalGPT (EN/DE)

## Summary
Add a complete i18n system using `react-i18next` with locale-prefixed URLs (`/en/...`, `/de/...`), a language switcher in navigation, browser language auto-detection, and SEO hreflang tags.

## Architecture

```text
/en/           -> Landing (English)
/de/           -> Landing (German)
/en/login      -> Login
/de/login      -> Login
/en/dashboard  -> Dashboard (protected)
/de/dashboard  -> Dashboard (protected)
/en/match/:id  -> Match Detail (protected)
/de/match/:id  -> Match Detail (protected)
...etc

/  -> redirect to /en or /de based on browser language or localStorage
```

## New Dependencies
- `react-i18next` + `i18next` — industry-standard React i18n library
- `i18next-browser-languagedetector` — auto-detect browser language

## New Files

### `src/i18n/en.json`
All English translation keys for Landing, Login, Header, Dashboard, common UI strings. Approximately 80-100 keys covering all user-facing text.

### `src/i18n/de.json`
German translations — natural, slightly formal, modern tone matching the GoalGPT brand.

### `src/i18n/index.ts`
i18next configuration: load EN/DE resources, set fallback to `en`, use localStorage detection + browser language detection, set `interpolation.escapeValue = false`.

### `src/components/LanguageSwitcher.tsx`
A compact EN/DE toggle button. Uses `useTranslation()` to switch language and updates the URL prefix. Persists choice to localStorage. Works on mobile and desktop.

### `src/components/SEOHead.tsx`
A component that injects hreflang `<link>` tags and language-specific `<meta>` tags (title, description, OG) into the document head via `useEffect`. Rendered on Landing and Login pages.

## Modified Files

### `src/App.tsx`
- Import and initialize i18n
- Add a `/:lang` prefix wrapper route that extracts the locale param and syncs it with i18next
- Create a `LocaleRouter` component that wraps all routes under `/:lang/*`
- Root `/` redirects to `/en` or `/de` based on detected language
- `ProtectedRoute` redirects to `/:lang/login` instead of `/login`

### `src/components/Header.tsx`
- Add `LanguageSwitcher` component next to the user avatar (desktop) and in mobile menu
- Replace all hardcoded strings with `t()` calls

### `src/pages/Landing.tsx`
- Replace all hardcoded text with `t()` translation keys
- Move static arrays (`valueCards`, `steps`, `features`) inside the component so they can use `t()`
- Add `SEOHead` component with language-specific metadata
- Update all `<Link>` components to include locale prefix

### `src/pages/Login.tsx`
- Replace hardcoded strings with `t()` calls
- Update navigation to use locale-aware paths

### `src/pages/Index.tsx`, `src/pages/MatchDetail.tsx`, and other protected pages
- Replace section headers and UI labels with `t()` calls for key visible strings
- Update internal `<Link>` components to include locale prefix

### `src/hooks/useAuth.tsx`
- Update redirect paths to be locale-aware

### `index.html`
- Add hreflang link tags for `en` and `de` (static fallback; dynamic ones added by SEOHead)

### `public/sitemap.xml`
- Add entries for `/en/`, `/de/`, `/en/login`, `/de/login`

### `public/robots.txt`
- Update to reflect new URL structure

## Translation Approach
- All user-facing static text on Landing, Login, Header, and key Dashboard labels get translation keys
- Dynamic data (match names, team names, AI-generated text) stays in the original language — only UI chrome is translated
- German translations are natural and slightly formal, not word-for-word
- Fallback to English if any key is missing (built into i18next)

## URL & Navigation Logic
1. A `LocaleLayout` wrapper component reads `:lang` from URL params
2. On mount, syncs `i18next.language` with the URL param
3. If `:lang` is not `en` or `de`, redirects to `/en/...`
4. `LanguageSwitcher` changes both i18next language and navigates to the equivalent path with the new prefix
5. `localStorage` key `goalgpt-lang` persists the choice

## SEO Details
- Each language version gets its own canonical URL
- hreflang tags: `<link rel="alternate" hreflang="en" href="https://ai-goal.lovable.app/en/..." />` and same for `de`
- OG title/description are language-specific via SEOHead component
- JSON-LD structured data includes `inLanguage` field

## Files Summary

| File | Action |
|---|---|
| `src/i18n/en.json` | New — English translations |
| `src/i18n/de.json` | New — German translations |
| `src/i18n/index.ts` | New — i18next config |
| `src/components/LanguageSwitcher.tsx` | New — EN/DE toggle |
| `src/components/SEOHead.tsx` | New — hreflang + meta injection |
| `src/App.tsx` | Major — locale-prefixed routing |
| `src/components/Header.tsx` | Add switcher + translate strings |
| `src/pages/Landing.tsx` | Translate all strings |
| `src/pages/Login.tsx` | Translate strings |
| `src/pages/Index.tsx` | Translate key labels |
| `src/hooks/useAuth.tsx` | Locale-aware redirects |
| `index.html` | Add hreflang tags |
| `public/sitemap.xml` | Add locale URLs |
| `public/robots.txt` | Update paths |

No database changes needed.

