

# GoalGPT Full System Health Check Report

## CRITICAL Issues (Must Fix)

### 1. `generate-statistical-prediction` is completely broken
The edge function logs show a continuous crash: `ReferenceError: Cannot access 'goalLines' before initialization` at line 280.

**Root cause:** At line 268, the code modifies `goalLines.over_2_5` inside a volatility adjustment block, but `goalLines` is not declared until line 317 (`const goalLines = computeGoalLines(...)`). JavaScript `const` has a temporal dead zone, so accessing it before declaration causes a runtime error.

**Impact:** Every statistical prediction call fails. This is being called repeatedly by `pre-match-predictions` and `batch-generate-predictions`, resulting in hundreds of failed invocations (visible in logs). **346 out of 527 upcoming matches have no prediction at all.**

**Fix:** Move the volatility adjustment block (lines 264-270) to after line 317 where `goalLines` is computed, or compute `goalLines` earlier.

### 2. SEO hardcoded URLs still point to `ai-goal.lovable.app`
`src/components/SEOHead.tsx` and `src/pages/Landing.tsx` have hardcoded `https://ai-goal.lovable.app` instead of the custom domain `goalgpt.io`. This hurts SEO since canonical URLs and structured data point to the wrong domain.

**Fix:** Replace hardcoded URLs with `https://goalgpt.io` or dynamically use `window.location.origin`.

---

## MEDIUM Issues (Should Fix)

### 3. Prediction coverage gap
- 330 total predictions exist across 4,423 matches
- 194 of 330 have AI reasoning (59%) — 136 predictions are stats-only with no reasoning
- Average confidence is 0.539 (reasonable) with min 0.01 (some outliers near zero)
- 42% outcome accuracy (44/104 reviewed) — acceptable but could improve

### 4. Console warning: `Function components cannot be given refs`
The `Trans` component from `react-i18next` in `Landing.tsx` is receiving a ref it cannot handle. This is a non-breaking warning but indicates improper component usage.

### 5. Model accuracy metrics need attention
- Average goals error of 1.97 is high (nearly 2 goals off per match)
- Exact score hits: 12/104 (11.5%) — reasonable for exact scores
- BTTS accuracy: 55/104 (52.9%) — barely above coin flip
- Outcome accuracy: 42.3% — below the ~45-50% benchmark for 1X2

### 6. 12 matches stuck in "live" status
There are 12 matches with `status = 'live'` — these may be stale if no actual live matches are happening. The 3-hour cleanup in `auto-sync` should catch these, but they persist.

---

## MINOR Issues (Nice to Fix)

### 7. JSON-LD cleanup not implemented
In `Landing.tsx`, the `useEffect` at line 39 adds a `<script type="application/ld+json">` element but the cleanup function may not remove previous scripts on re-render, leading to duplicate structured data.

### 8. Missing `landing.sign_up` translation key
Line 91 uses a fallback `t("landing.sign_up", "Sign Up")` — this key doesn't exist in either `en.json` or `de.json`, so it always uses the fallback string (English) even in German mode.

### 9. React Router v6 deprecation warnings
Console shows warnings about `v7_startTransition` and `v7_relativeSplatPath` future flags. Non-breaking but should be addressed before upgrading.

---

## Performance Insights

- Edge functions boot in ~22-31ms (fast)
- `generate-statistical-prediction` is being called rapidly in loops (every ~1s) and always failing, wasting compute
- `sync-football-data` is healthy, fetching data with 7,285+ API calls remaining
- No database query performance issues detected
- Frontend query caching is configured well (30s stale time, no window refocus)

---

## Stable Components (Confirmed Working)

- Authentication system (Google login verified in auth logs)
- Match data sync pipeline (`sync-football-data` operates correctly)
- i18n routing system (EN/DE prefixes work)
- Dashboard rendering and league filtering
- Match detail page structure
- Community voting and comments system
- Profile management
- Auto-sync mode detection logic

---

## Implementation Plan

### Step 1: Fix the `goalLines` crash (Critical)
In `supabase/functions/generate-statistical-prediction/index.ts`:
- Move `const goalLines = computeGoalLines(lambdaHome, lambdaAway)` from line 317 to before line 264 (before the volatility adjustment block)
- Move `const goalDist = computeGoalDistribution(lambdaHome, lambdaAway)` alongside it
- Redeploy the edge function

### Step 2: Fix SEO URLs
In `src/components/SEOHead.tsx` and `src/pages/Landing.tsx`:
- Replace `https://ai-goal.lovable.app` with `https://goalgpt.io`

### Step 3: Add missing translation key
In `src/i18n/de.json`: add `"sign_up": "Registrieren"` under `landing`
In `src/i18n/en.json`: add `"sign_up": "Sign Up"` under `landing`

### Step 4: Trigger batch prediction regeneration
After deploying the fix, invoke `pre-match-predictions` to generate predictions for the 346 matches currently missing them.

