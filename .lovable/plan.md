

# Enhance AI Prediction Engine with Live Data

## Current State

The AI has three data layers, but they're underutilized:

1. **Database context** — team form (last 5 results), past predictions, past reviews
2. **API-Football** — injuries, lineups, predictions (only works when `api_football_id` exists, which scraped matches lack)
3. **Web search via Gemini** — general match info (no targeted scraping)

Key weaknesses:
- The scraper collects matches but doesn't scrape **player-level data** (who's playing, who's injured)
- `fetch-match-context` asks Gemini to "search the web" generically — it doesn't use Firecrawl to get actual live pages
- News from VI.nl is scraped but only stored as text snippets, not structured player availability data
- Head-to-head data from the DB is fetched but not included in the batch prediction prompt
- The model uses `gemini-2.5-flash` for insights but could use the stronger `gemini-2.5-pro` for final predictions

## Enhancement Plan

### Phase 1: Firecrawl-powered live context in `fetch-match-context`

Instead of relying solely on Gemini's knowledge, use Firecrawl to scrape **actual live pages** before asking AI to synthesize.

**File: `supabase/functions/fetch-match-context/index.ts`**

Add a new step between API-Football data and AI synthesis:
- Scrape the team-specific VI.nl match page for lineup/injury news
- Scrape `iservoetbalvanavond.nl` for today's match details (kickoff times, broadcasters)
- Feed the **raw scraped markdown** into the AI prompt so it has real, current data to work with

This turns the AI from "guessing from training data" into "analyzing live web content."

### Phase 2: Richer database context in `generate-ai-prediction`

**File: `supabase/functions/generate-ai-prediction/index.ts`**

Add parallel queries for:
- **Head-to-head history**: last 5 meetings between these exact two teams (scores, dates)
- **Home/away split**: separate form for home matches vs away matches (not just overall)
- **League table position**: query all completed matches to calculate approximate league standing
- **Goal-scoring patterns**: average goals scored/conceded per game for each team
- **Clean sheet count**: how many clean sheets in last 10 matches

All of this data exists in the `matches` table already — it just needs to be queried and formatted into the prompt.

### Phase 3: Enhanced batch predictions with live context

**File: `supabase/functions/batch-generate-predictions/index.ts`**

Currently batch predictions only use team names, form (W/D/L), and news snippets. Enhance by:
- Calling `fetch-match-context` for each match (with a rate limit delay) to get injuries/lineups
- Including H2H record in the prompt
- Using `gemini-2.5-pro` instead of `gemini-3-flash-preview` for higher quality predictions
- Adding the league context (e.g., "PSG is 1st, Toulouse is 12th")

### Phase 4: Structured match intelligence table

**Database migration**: Create a `match_context` table to cache scraped intelligence so it doesn't need to be re-fetched every time.

| Column | Type | Purpose |
|---|---|---|
| `match_id` | uuid (FK) | Link to match |
| `injuries_home` | jsonb | `[{player, reason, return_date}]` |
| `injuries_away` | jsonb | Same |
| `lineup_home` | jsonb | `[{player, position}]` |
| `lineup_away` | jsonb | Same |
| `suspensions` | jsonb | Players suspended |
| `weather` | text | Match day weather |
| `h2h_summary` | text | Head-to-head summary |
| `news_items` | jsonb | Relevant news linked to this match |
| `scraped_at` | timestamptz | When this was last refreshed |

This avoids redundant scraping and lets the auto-sync pipeline build context gradually.

### Phase 5: Upgrade model for final predictions

**File: `supabase/functions/generate-ai-prediction/index.ts`**

- Switch from `gemini-2.5-flash` to `gemini-2.5-pro` for the final insight generation (deeper reasoning)
- Increase `max_tokens` from 1200 to 2000 for more detailed analysis
- Add structured output requesting specific prediction sections (scoreline prediction, BTTS, corners estimate)

## Files to Change

| File | Change |
|---|---|
| `supabase/functions/fetch-match-context/index.ts` | Add Firecrawl scraping of live pages before AI synthesis |
| `supabase/functions/generate-ai-prediction/index.ts` | Add H2H, home/away split, league position queries; upgrade model to gemini-2.5-pro |
| `supabase/functions/batch-generate-predictions/index.ts` | Call fetch-match-context per match; add H2H; use stronger model |
| Database migration | Create `match_context` table for caching scraped intelligence |

## Impact

- Predictions go from "AI guessing with team names + form" to "AI analyzing live injury reports, confirmed lineups, league standings, H2H history, and recent news"
- Context is cached so the auto-sync pipeline builds intelligence over time without redundant scraping
- Stronger model (gemini-2.5-pro) for final analysis means better reasoning

