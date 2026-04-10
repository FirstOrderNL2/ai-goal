

# SEO Optimization for GoalGPT

## Summary
Improve search engine discoverability by adding structured data, a sitemap, canonical URLs, and fixing existing meta tag issues. Since this is a React SPA, we also need to ensure the landing page content is crawlable.

## Changes

### 1. Fix `index.html` meta tags
- Remove TODO comments and duplicate/redundant meta tags
- Add `canonical` link pointing to `https://ai-goal.lovable.app`
- Add `og:url` meta tag
- Update `meta name="author"` from "Lovable" to "GoalGPT"
- Remove `twitter:site` @Lovable reference (or update to GoalGPT's handle)
- Add `theme-color` meta tag
- Add `keywords` meta tag with relevant football/AI prediction terms

### 2. Add `public/sitemap.xml`
Static sitemap listing public routes:
- `/` (landing page)
- `/login`

Protected routes are excluded since they require auth. Set `lastmod` to current date and `priority` appropriately.

### 3. Update `public/robots.txt`
- Add `Sitemap: https://ai-goal.lovable.app/sitemap.xml`
- Simplify to a single `User-agent: *` block
- Disallow protected routes that shouldn't be indexed (`/dashboard`, `/match/*`, `/profile`, etc.)

### 4. Add JSON-LD structured data to `Landing.tsx`
Add a `<Helmet>` or inline `<script type="application/ld+json">` via a new `SEOHead` component rendered on the landing page with:
- `WebSite` schema (name, url, description)
- `Organization` schema (name, logo)

Since we can't use `react-helmet` without installing it, we'll inject the JSON-LD script tag via `useEffect` in the Landing page.

### 5. Add `<noscript>` fallback content in `index.html`
Add a `<noscript>` tag in `<body>` with basic text content so crawlers that don't execute JS can still see key information about GoalGPT.

## Files

| File | Action |
|---|---|
| `index.html` | Clean up meta tags, add canonical, og:url, keywords, noscript fallback |
| `public/sitemap.xml` | New static sitemap |
| `public/robots.txt` | Add sitemap reference, disallow protected routes |
| `src/pages/Landing.tsx` | Add JSON-LD structured data via useEffect |

No database changes needed.

