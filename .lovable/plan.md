

The user is asking whether "199 matches evaluated" on the Accuracy page is real/current data.

**Investigation from the network requests already in context:**

The latest `model_performance` record (Model v4, created `2026-04-16T14:20:27`) shows:
- `total_matches: 199`
- `period_end: 2026-04-16`
- `last_learning_match_count: 1000` (this is suspicious — gate uses this count, but the `total_matches` field is 199)

The `compute-model-performance` call response from today shows: `"current_matches": 1000, "last_learning_at": 1000, "next_trigger_at": 1050`.

**The discrepancy:** The edge function tracks `current_matches: 1000` (likely total reviewed predictions/all-time), but the displayed `total_matches: 199` on the v4 record only counts matches within the 90-day window (`period_start: 2026-01-16` → `period_end: 2026-04-16`).

So the user is right that there are MORE than 199 matches — there are ~1000 total reviews. The "199" only reflects the rolling 90-day evaluation window.

Also: the v4 record was computed yesterday (April 16), not today. New reviews from today (e.g. the April 17 01:15 reviews visible in `prediction_reviews`) are NOT yet reflected because the next learning cycle won't fire until 1050 matches (currently at 1000).

**What the user is seeing is technically correct but misleading:**
- "199 matches evaluated" = matches in the 90-day analysis window of the **last completed learning cycle** (v4 from yesterday)
- "Last computed 16-4-2026" = correct, that's when v4 ran
- The actual review pool is ~1000+ but only the last 90 days drive metrics

I'll present a concise plan to clarify this in the UI.

## Plan: Clarify the "199 matches" stat on the Accuracy page

### What's actually happening
- The `total_matches: 199` field on Model v4 reflects only matches inside the **90-day analysis window** (Jan 16 – Apr 16, 2026)
- The `compute-model-performance` function tracks a separate `current_matches: 1000` counter representing **all-time reviewed predictions**
- The next learning cycle fires at 1050 total reviews (currently 1000) — so the 199 number won't refresh until then
- New reviews from today (April 17) exist in `prediction_reviews` but aren't reflected because v4 was computed yesterday

### UI fix in `src/pages/Accuracy.tsx`

1. **Relabel the stat**: change `"199 matches evaluated"` → `"199 matches in 90-day window"` to make the scope explicit.

2. **Add a second number next to it**: fetch total `prediction_reviews` count (all-time) and display `"~1,000 total reviews on record"` so the user sees both numbers.

3. **Add a tooltip** on the stat explaining: "Metrics are computed from completed matches in the last 90 days. The full review history powers the next learning cycle."

4. **Fix the "Last computed" label**: append the relative time ("1 day ago") so it's clear the v4 snapshot isn't real-time.

5. **Add a freshness warning** if `created_at` of the latest `model_performance` is >24h old: a small amber pill saying "Stats refresh on next learning cycle (next at 1050 reviews, currently 1000)".

### Files to modify
- `src/pages/Accuracy.tsx` — relabel, add total review count, tooltip, freshness pill
- `src/hooks/useModelPerformance.ts` — add a small `useTotalReviewCount()` hook that runs `count` on `prediction_reviews`

No edge function or migration changes needed — this is a UI clarity fix.

