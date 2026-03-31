

# Fix Empty Matches + Add Web-Enriched AI Predictions

## Why There Are Zero Matches

The database was truncated to remove demo data. Matches only appear after clicking "Sync Live Data", which calls two edge functions:
- `sync-football-data`: Uses API-Football to fetch fixtures. The free tier may restrict current-season data (2025-26), causing zero results.
- `sync-sportradar-data`: Only matches Sportradar IDs to existing matches — it does not create new ones.

If API-Football returns nothing for the current season, no matches are inserted.

## Plan

### 1. Fix Match Sync to Use Sportradar as Primary Source

The Sportradar sync already fetches full schedules but only updates existing matches. We will enhance it to **create** matches and teams directly from Sportradar data when they do not exist, making it a standalone data source instead of a secondary enrichment layer.

**Changes to `sync-sportradar-data/index.ts`:**
- When a team from Sportradar is not found in the DB, **insert it** (name, league, country, sportradar_id)
- When a match is not found in the DB, **insert it** (date, teams, league, status, round, sportradar_id)
- Determine match status from `sport_event_status` (closed = completed, not_started = upcoming)
- Pull scores from `sport_event_status.home_score` / `away_score` for completed matches
- This ensures matches populate even if API-Football free tier returns nothing

### 2. Auto-Sync on Page Load

Instead of requiring users to click "Sync Live Data", trigger a background sync automatically when the Index page loads (with a cooldown so it does not spam the API).

**Changes to `src/pages/Index.tsx`:**
- Add a `useEffect` that calls the sync on first load, storing last-sync timestamp in `localStorage`
- Only auto-sync if more than 30 minutes have passed since last sync
- Still keep the manual "Sync Live Data" button

### 3. Add Web Search to AI Prediction (Injuries, Suspensions, Lineups)

Create a new edge function `fetch-match-context` that uses the Lovable AI with a web search tool (via Perplexity or a Gemini search-grounded call) to gather live context about a match before the AI generates its prediction.

**New edge function `supabase/functions/fetch-match-context/index.ts`:**
- Takes `home_team`, `away_team`, `league`, `match_date`
- Uses Gemini with a search-grounded prompt to find:
  - Injured players for both teams
  - Suspended players
  - Expected lineups
  - Recent team news (manager changes, transfers, morale)
  - Weather conditions at the venue
  - Any other relevant match context
- Returns structured context as text

**Changes to `generate-ai-prediction/index.ts`:**
- Before building the prompt, call `fetch-match-context` internally (or inline the logic)
- Append the web-sourced context to the prompt under a "LIVE MATCH CONTEXT" section
- The AI now has injuries, suspensions, lineups, and news when making predictions

### 4. Add Web Context to Post-Match Review Too

**Changes to `generate-post-match-review/index.ts`:**
- After the match, search for post-match reports and actual events
- Include in the review prompt so the AI can compare its prediction against what actually happened with full context

## Technical Details

### Sportradar as Primary Source (Step 1)
The Sportradar schedules endpoint already returns team names, IDs, dates, and status. The current code skips creating new records. The change is:
```
// Before: skip if team not found
// After: insert team if not found, then insert match
```

### Web Search via Gemini Grounding (Step 3)
Use Gemini's built-in search grounding by adding `tools: [{ google_search: {} }]` to the API call. This lets the model search the web natively without needing a separate search API or Firecrawl connector. The Lovable AI gateway supports this via the standard OpenAI-compatible format.

Alternatively, we make a two-step AI call:
1. First call: Ask Gemini to generate a search query for the match context
2. Use a simple web search (or Perplexity if connected) to get results
3. Feed results into the prediction prompt

The simpler approach is to embed the search directly in the prediction prompt by telling Gemini to use its training knowledge about current football news for the specific teams and date.

### File Changes Summary

| File | Change |
|---|---|
| `supabase/functions/sync-sportradar-data/index.ts` | Create teams + matches from Sportradar (not just match existing) |
| `src/pages/Index.tsx` | Auto-sync on load with 30-min cooldown |
| `supabase/functions/generate-ai-prediction/index.ts` | Add web-sourced context (injuries, lineups, news) to prompt |
| `supabase/functions/generate-post-match-review/index.ts` | Add post-match web context |

No database migrations needed — existing tables already support all required fields.

