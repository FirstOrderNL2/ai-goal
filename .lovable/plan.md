

# Optimize API-Football Request Usage

## Problem
The `sync-football-data` function makes **too many API calls per sync**, hitting the daily quota limit. Current worst case: ~500+ calls per sync cycle across 20 leagues.

### Current Call Breakdown (per sync)
- **2 calls** for live + today's fixtures
- **40 calls** for fixtures (20 leagues × 2 date ranges: full season completed + upcoming)
- **20 calls** for standings (every league, every sync)
- **200 calls** for team statistics (20 leagues × 10 teams each)
- **100 calls** for predictions (20 leagues × 5 fixtures)
- **60 calls** for H2H (20 leagues × 3 fixtures)
- **60 calls** for lineups (20 leagues × 3 fixtures)
- **20 calls** for players (20 leagues × 1 page)

**Total: ~502 calls** per sync, exceeding the 400 limit regularly.

## Key API Documentation Insights

1. **`ids` parameter** (v3.9.2+): Fetch up to **20 fixtures in one call** with events, lineups, statistics, and players included. Massive saver.
2. **`live` parameter accepts league filters**: `live=39-61-140` instead of `live=all` to get only our tracked leagues.
3. **`next` / `last` parameters**: Fetch only the next N or last N fixtures per league/team — no need for full-season date range queries.
4. **Recommended call frequencies** from docs:
   - Standings: 1/hour when live, 1/day otherwise
   - Fixtures: 1/minute when live, 1/day otherwise
   - Team stats: updated every hour

## Optimization Plan

### 1. Replace full-season fixture fetch with `next` + `last` per league
**Current**: 2 calls per league (from/to date ranges covering entire season) = 40 calls
**New**: 1 call per league using `next=15` for upcoming = 20 calls
Skip refetching completed fixtures — they don't change. Only fetch `last=5` for leagues with recent matches (to update final scores).
**Savings: ~20 calls**

### 2. Use `ids` batching for lineups, H2H, and predictions
**Current**: Individual calls per fixture (up to 60+100+60 = 220 calls)
**New**: Group fixture IDs and fetch up to 20 per call using `ids=id1-id2-id3...` — this returns events, lineups, stats, and players in one response. For the ~15 upcoming fixtures needing lineups, that's 1 call instead of 15.
**Savings: ~150+ calls**

### 3. Use league-filtered `live` parameter
**Current**: `live=all` fetches every live fixture globally
**New**: `live=39-140-135-78-61-88-89-40-2-3-848-748-1-32-34-33-5-4-9-10` fetches only tracked leagues
**Savings**: Minimal call savings (still 1 call) but reduces data processing

### 4. Throttle standings and team stats to daily
**Current**: Standings and team stats fetched every sync for all leagues (~220 calls)
**New**: 
- Check `leagues.updated_at` — skip if updated within last 6 hours
- Team stats: only fetch for leagues where matches were played today, max 5 teams per league
- Store a `last_stats_sync` timestamp and skip if < 24h old
**Savings: ~180 calls on most syncs**

### 5. Skip players fetch during regular syncs
**Current**: 20 calls for player data every sync
**New**: Only fetch players once daily (check last sync timestamp)
**Savings: ~20 calls on most syncs**

### 6. Add per-minute rate limiting
The API has a **per-minute** rate limit (not just daily). Add a check of `X-RateLimit-Remaining` header and throttle with longer delays when running low. Current 300ms delay is too aggressive when hitting limits.

### 7. Prioritize calls with a budget system
Split the sync into priority tiers:
- **P0** (always): Live fixtures, today's fixtures (~2-3 calls)
- **P1** (every sync): Upcoming fixtures for each league using `next=10` (~20 calls)
- **P2** (every 6h): Standings (~20 calls)
- **P3** (daily): Team stats, players, full H2H (~200 calls)
- **P4** (on-demand): Predictions from API (replaced by our own AI predictions anyway)

## File Changes

### `supabase/functions/sync-football-data/index.ts`
Complete rewrite of the sync logic:
- Replace full-season date range queries with `next=10` / `last=5` per league
- Use `live=39-140-135-...` with league IDs instead of `live=all`
- Add timestamp-based skipping for standings (6h), team stats (24h), players (24h)
- Use `ids` batching: collect all upcoming fixture IDs, then fetch in batches of 20
- Add per-minute rate limit awareness from `X-RateLimit-Remaining` header
- Lower `API_CALL_LIMIT` from 400 to 100 for regular syncs (budget system)
- Add a `mode` parameter: `"full"` (daily comprehensive) vs `"quick"` (frequent live updates)

### `supabase/functions/auto-sync/index.ts`
- Pass `mode: "quick"` for regular cron syncs
- Add a separate daily schedule that passes `mode: "full"` for comprehensive data refresh

## Expected Results

| Metric | Before | After (quick) | After (full) |
|--------|--------|---------------|--------------|
| API calls per sync | ~500 | ~25-50 | ~200 |
| Daily call budget (10 syncs/day) | ~5000 | ~250-500 | +200 |
| Rate limit hits | Frequent | Rare | Rare |
| Live score updates | Working | Working | Working |

