

# Current Status & Next Phase Plan

## Current Bugs and Issues

### 1. Console Ref Warnings (Low severity)
`MatchInsightsCard` and `StatsBombSection` are function components receiving refs from the parent. The console shows "Function components cannot be given refs" warnings. These need wrapping with `React.forwardRef` or the parent needs to stop passing refs.

### 2. Sportradar Sync Partial Failure
Edge function logs show `SR API error 500 for /seasons/sr:season:118691/probabilities.json` (La Liga). The sync continues but La Liga probabilities are missing. The code handles this gracefully (returns null), but the season IDs may be stale or Sportradar's trial may not cover all seasons. Should add fallback logic or update season IDs.

### 3. Sportradar League Name Mismatch
The sync function uses league names like `"premier_league"`, `"la_liga"`, `"serie_a"` but the DB and frontend use `"Premier League"`, `"La Liga"`, `"Serie A"`. This means Sportradar team name matching may fail since the league filter won't align. The `config.league` value in `sync-sportradar-data` should match the DB values.

### 4. Sync Season/Date Hardcoding
`sync-football-data` hardcodes `SEASON = 2024` and date ranges `2024-11-01` to `2025-05-31`. These will become stale. Similarly, Sportradar season IDs are hardcoded. Should dynamically determine current season.

### 5. Sportradar useSportradarData Hook Issue
In `useSportradar.ts`, `srProxy` calls `supabase.functions.invoke` first (unused result), then manually constructs a fetch URL. The initial invoke call is dead code wasting a request.

### 6. No Authentication
All tables are public read-only. The sync functions use service role keys, but there's no user auth — anyone can trigger the sync button. Not critical for MVP but a concern.

### 7. Missing `unique` constraint on `predictions.match_id`
The sync functions do `upsert` with `onConflict: "match_id"`, but the schema doesn't show a unique constraint on `predictions.match_id`. This would cause upserts to fail silently or insert duplicates.

### 8. Teams Logo Display
The `Teams` page shows team initials instead of logos even though `logo_url` is stored. Should display actual logos.

---

## Next Phase Plan

### Phase 1: Fix Existing Bugs (Priority)

**1.1 Fix ref warnings** — Remove ref passing to `FunFactsCard`, `MatchInsightsCard`, and `StatsBombSection` in MatchDetail, or wrap them with `forwardRef`.

**1.2 Fix Sportradar league name mismatch** — Update `sync-sportradar-data` to use `"Premier League"`, `"La Liga"`, `"Serie A"` instead of snake_case.

**1.3 Remove dead invoke call** in `useSportradar.ts` `srProxy` function.

**1.4 Add unique constraint on `predictions.match_id`** if missing, to ensure upserts work correctly.

**1.5 Dynamic season dates** — Update `sync-football-data` to calculate current season dates dynamically instead of hardcoding.

### Phase 2: AI-Powered Predictions (Core Feature)

**2.1 Create AI prediction edge function** — Use Lovable AI (Gemini) to generate match predictions based on:
- Team form (recent results from DB)
- H2H history
- Sportradar probabilities
- API-Football predictions
- StatsBomb historical data (if available)

**2.2 AI insights generation** — Generate pre-match analysis text using Lovable AI, stored in `matches.ai_insights`. Show as a rich card on MatchDetail.

**2.3 Prediction confidence scoring** — Combine multiple data sources (API-Football predictions, Sportradar probabilities, AI model output) into a blended confidence score.

### Phase 3: UI/UX Improvements

**3.1 Team logos on Teams page** — Display actual logos from `logo_url`.

**3.2 Standings page** — New `/standings` route using Sportradar standings endpoint.

**3.3 Lineups display** — Show formations and lineups on MatchDetail using Sportradar lineups endpoint.

**3.4 Mobile responsiveness** — Current viewport is 411px; ensure all cards, filters, and navigation work well on mobile.

**3.5 Dark/light theme toggle** — Add theme switching.

### Phase 4: Data Pipeline Robustness

**4.1 Scheduled sync** — Add a cron-like mechanism (pg_cron or manual) to auto-sync data daily.

**4.2 Error handling & retry** — Better error handling in sync functions with retry logic for API failures.

**4.3 Rate limit awareness** — Track API call counts to avoid exceeding free tier limits (100/day API-Football, 1000/day Sportradar).

## Technical Details

- **AI predictions** will use an edge function calling `https://ai.gateway.lovable.dev/v1/chat/completions` with `google/gemini-3-flash-preview`, passing structured match context and using tool calling to extract structured prediction JSON.
- **Unique constraint migration**: `ALTER TABLE predictions ADD CONSTRAINT predictions_match_id_unique UNIQUE (match_id);`
- **Dynamic season**: Calculate from current date — if month >= 8, season = current year, else season = previous year.
- The Sportradar league name fix is a one-line change per league in the `LEAGUE_SEASONS` config object.

