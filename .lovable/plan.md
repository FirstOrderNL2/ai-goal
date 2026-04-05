

# Fix: Matches Not Transitioning to Live Status

## Root Cause

The auto-sync mode detection has a **dead zone**. When a match kicks off:
1. Its DB `status` is still `"upcoming"` 
2. Its `match_date` is now in the past

The detection logic checks:
- Live matches: `status = 'live'` → finds nothing (still "upcoming")
- Imminent matches: `status = 'upcoming' AND match_date >= now AND <= now+1h` → misses it because `match_date < now`

Result: auto-sync falls to **idle** mode, which skips live fixture fetching. The match is stuck as "upcoming" forever until a manual or full sync runs.

## Fix

### 1. Fix auto-sync mode detection (auto-sync/index.ts)

Add a third check: matches with `status = 'upcoming'` where `match_date` is in the **recent past** (e.g., within the last 3 hours). These are matches that should have started but haven't been updated yet.

```
-- Current checks:
1. status = 'live'           → live mode  ✓
2. upcoming + starting soon  → pre_match  ✓

-- Add:
3. upcoming + match_date in last 3 hours → live mode (they should be live or finished)
```

This closes the gap: any match that was scheduled in the last 3 hours but still shows "upcoming" triggers live mode, which fetches live fixtures and today's results from API-Football, updating the status correctly.

### 2. Simplify frontend live match query (useMatches.ts)

The `useLiveMatches` hook queries for `status IN ('live', '1H', '2H', 'HT', 'ET')`. But `mapStatus()` in the sync function maps all live API statuses (1H, 2H, HT, ET, BT, P) to just `"live"`. So the DB will only ever contain `status = 'live'`, never `'1H'` or `'2H'`.

Simplify to just query `status = 'live'` for clarity and correctness.

### Changes Summary

| File | Change |
|------|--------|
| `supabase/functions/auto-sync/index.ts` | Add "stale upcoming" check: matches with `status='upcoming'` and `match_date` between `now - 3h` and `now` trigger live mode |
| `src/hooks/useMatches.ts` | Simplify `useLiveMatches` to query `status = 'live'` only |

### How It Works After Fix

```text
Match kicks off at 14:00 UTC
├─ 13:00: auto-detect sees upcoming match in 1h → pre_match mode ✓
├─ 14:00: match_date passes, DB still "upcoming"
├─ 14:05: auto-detect sees "upcoming" match from 5min ago → live mode ✓
│          sync fetches live fixtures → updates status to "live"
├─ 14:10+: auto-detect sees status="live" → live mode ✓ (normal path)
└─ 15:50: match ends, sync sets "completed" ✓
```

