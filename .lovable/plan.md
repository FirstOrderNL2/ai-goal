

# Fix the bugs surfaced by the Phase 1–6 audit

## What's actually broken (verified live)

1. **Recheck windows never fire.** `prediction_logs` for the last 6h: 316 rows, **100% `update_reason='initial'`** — zero `recheck_60/30/15/10/5`. Root cause is in `pre-match-predictions/index.ts:183`. The window-match condition `minutesLeft <= w.minutesBefore + 2 && minutesLeft >= w.minutesBefore - 4` produces 7-minute bands at {61–56, 32–26, 17–11, 12–6, 7–1} that **overlap** (recheck_15 vs recheck_10 both claim minutes 11–12) and **leave huge gaps** (minutes 55–33 and 25–18 belong to nobody). Most matches sail through Phase B without ever matching a window, so they only get the initial prediction and never refresh.

2. **`ml_readiness_v` overcounts usable labels.** View reports 2,023 labeled samples, but only **296** are true pre-kickoff predictions (the other 1,727 are post-match backfill snapshots and would leak into ML training if used). The view doesn't filter `predictions.created_at <= matches.match_date`.

3. **7 leaked enrichment / 7 leaked intelligence rows.** Confirmed: rows where `enriched_at > match_date` by 1–103 minutes. The freeze guard in `enrich-match-context:308` (and same in `football-intelligence:329`) only freezes when `isPreMatch=true`, so a call that arrives 1 minute after kickoff writes the row unfrozen, and any further call up to ~100 minutes later overwrites it again. Need a hard reject when `now > match_date` and the row isn't already frozen.

## Fixes

### 1. `supabase/functions/pre-match-predictions/index.ts` — fix window matching

Replace the buggy band-find with a contiguous, non-overlapping bucket:

```ts
const windows = [
  { reason: "recheck_60", min: 31, max: 60, freshnessMinutes: 25 },
  { reason: "recheck_30", min: 16, max: 30, freshnessMinutes: 13 },
  { reason: "recheck_15", min: 11, max: 15, freshnessMinutes: 7  },
  { reason: "recheck_10", min: 6,  max: 10, freshnessMinutes: 4  },
  { reason: "recheck_5",  min: 1,  max: 5,  freshnessMinutes: 3  },
];
const win = windows.find(w => minutesLeft >= w.min && minutesLeft <= w.max);
```

Result: every match in the next 60 min lands in exactly one bucket. Phase B will start tagging `recheck_*` immediately on the next cron tick.

### 2. New migration — fix `ml_readiness_v` to count only leak-free labels

```sql
CREATE OR REPLACE VIEW public.ml_readiness_v AS
WITH true_labels AS (
  SELECT pr.id
  FROM public.prediction_reviews pr
  JOIN public.predictions p ON p.match_id = pr.match_id
  JOIN public.matches m ON m.id = pr.match_id
  WHERE pr.actual_outcome IS NOT NULL
    AND p.feature_snapshot IS NOT NULL
    AND p.created_at <= m.match_date  -- strict pre-kickoff
),
true_snaps AS (
  SELECT p.id FROM public.predictions p
  JOIN public.matches m ON m.id = p.match_id
  WHERE p.feature_snapshot IS NOT NULL AND p.created_at <= m.match_date
)
SELECT
  (SELECT count(*) FROM true_labels)::int AS labeled_samples,
  (SELECT count(*) FROM true_snaps)::int  AS feature_snapshots,
  CASE WHEN (SELECT count(*) FROM true_snaps)=0 THEN 0::float
       ELSE (SELECT count(*) FROM true_labels)::float / (SELECT count(*) FROM true_snaps) END AS label_coverage,
  CASE WHEN (SELECT count(*) FROM true_labels) >= 2000 THEN 'ready' ELSE 'collecting' END AS ml_status,
  GREATEST(0, 2000 - (SELECT count(*) FROM true_labels))::int AS samples_to_target;
ALTER VIEW public.ml_readiness_v SET (security_invoker = true);
GRANT SELECT ON public.ml_readiness_v TO anon, authenticated;
```

`PipelineHealthCard` reads from this view → its progress bar will honestly show ~296/2000 ("collecting"), not the misleading "ready". No frontend change needed.

### 3. `enrich-match-context/index.ts` + `football-intelligence/index.ts` — reject post-kickoff writes

Right after the existing `frozen_at` early-return (~line 35 in both files), add:

```ts
const matchDateMs = new Date((match as any).match_date).getTime();
if (Date.now() > matchDateMs && !existing?.frozen_at) {
  // Late-arriving call after kickoff and we never froze pre-match → do not write.
  // Mark whatever we have as frozen-as-of-now to prevent future overwrites.
  if (existing) {
    await supabase.from("match_enrichment")  // or match_intelligence
      .update({ frozen_at: new Date().toISOString(), frozen_for_match_date: (match as any).match_date })
      .eq("match_id", match_id);
  }
  return new Response(JSON.stringify({ success: true, skipped: true, reason: "post-kickoff, refusing late write" }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
```

Eliminates the leakage class. Existing 7 leaked rows are historical and don't affect future training (the new `ml_readiness_v` filter handles them).

## Files touched

- `supabase/functions/pre-match-predictions/index.ts` — windows array + `find()` predicate (lines 146–184)
- `supabase/functions/enrich-match-context/index.ts` — post-kickoff guard
- `supabase/functions/football-intelligence/index.ts` — same guard
- New migration — replace `ml_readiness_v`

## Out of scope

- Backfilling/cleaning the 7 already-leaked rows (small impact, would need targeted re-fetch with `as_of` cutoff).
- Productionizing the LightGBM model — separate decision.
- Building a UI badge that distinguishes "true labels" from "backfill labels" — view fix already corrects the headline number.

## Success criteria (verifiable within 1 cron cycle)

- Within 5 min of deploy: `prediction_logs` for the next hour shows non-zero `recheck_60/30/15/10/5` entries.
- `ml_readiness_v.labeled_samples` drops from 2,023 → ~296 and `ml_status` flips to `collecting`.
- New `enrich-match-context` / `football-intelligence` calls after kickoff return `{skipped: true, reason: "post-kickoff..."}` instead of writing.
- 24h after deploy: count of `match_enrichment` rows with `enriched_at > match_date` should not increase beyond the current 7.

