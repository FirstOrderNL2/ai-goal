

# GoalGPT System Health Check Report

## CRITICAL Issues (Must Fix Immediately)

### 1. `generate-statistical-prediction` edge function NOT deployed
The code fix from the previous session (moving `goalLines` declaration before the volatility block) exists in the repository at lines 264-266 but the **deployed version still crashes**. Logs show continuous `ReferenceError: Cannot access 'goalLines' before initialization` errors as recently as 19:20 UTC today. The most recent log entry at 19:26 shows a boot followed by a 404 — indicating the function may have been deleted or is in a broken deploy state.

**Impact**: 346 of 527 upcoming matches have zero predictions. Every call returns HTTP 500.

**Fix**: Redeploy `generate-statistical-prediction` edge function, then verify with a test invocation.

### 2. 12 matches stuck in "live" status
12 matches show `status = 'live'` but none are stale (all started within the last 3 hours), so these may be legitimately live right now. No action needed unless they persist past the 3-hour window.

---

## MEDIUM Issues (Should Fix)

### 3. Low prediction coverage
- Only 330 predictions across 4,423 total matches (7.5%)
- 346 upcoming matches have no prediction at all (due to the crash above)
- Once the edge function is redeployed, trigger `pre-match-predictions` to backfill

### 4. Model accuracy below benchmarks
- Outcome accuracy: 42.3% (44/104) — below the 45-50% benchmark for 1X2
- BTTS accuracy: 52.9% (55/104) — barely above coin flip
- Average goals error: 1.97 — nearly 2 goals off per match
- O/U 2.5 accuracy: 54.8% (57/104)
- Exact score hits: 11.5% (12/104) — acceptable for exact scores

**Recommendation**: After deploying the fix and generating new predictions, run `compute-model-performance` to recalibrate weights.

### 5. 2 predictions with very low confidence (< 0.05)
These outliers suggest edge cases where the model had insufficient data. Consider clamping minimum confidence to 0.10.

---

## MINOR Issues (Nice to Fix)

### 6. React Router v6 deprecation warnings
Console shows `v7_startTransition` and `v7_relativeSplatPath` future flag warnings. Non-breaking but should be addressed before React Router v7 migration.

---

## Stable Components (Confirmed Working)

- Authentication system (Google OAuth + email login with localized callback)
- Database schema and RLS policies (properly configured)
- Match data sync pipeline (`sync-football-data` operational)
- i18n system (EN/DE translations complete, including `sign_up` key)
- SEO URLs (corrected to `goalgpt.io`)
- Frontend routing with `/:lang/` prefixes
- Query caching (30s stale time, no window refocus)
- Edge function boot times (~20-30ms)
- Landing page mobile header (responsive layout fixed)

---

## Implementation Plan

### Step 1: Redeploy the `generate-statistical-prediction` edge function
The code is already fixed in the repo. Just needs deployment and verification.

### Step 2: Trigger prediction generation
After successful deployment, invoke `pre-match-predictions` to generate predictions for the 346 upcoming matches currently missing them.

### Step 3: Run model recalibration
Invoke `compute-model-performance` to update weights based on the 104 reviewed matches.

### Step 4: (Optional) Clamp minimum confidence
Add a `Math.max(0.10, confidence)` floor in the statistical prediction function to prevent near-zero confidence outliers.

