

# Why Today's Matches Are Missing + Web Scraping Plan

## Root Cause

The database has a **2-day gap**: completed matches end March 31, upcoming matches start April 3. Today (April 1) and April 2 have **zero matches**. This happens because:

1. **API-Football free tier** rejects all 2025+ season requests ("Free plans do not have access to this season, try from 2022 to 2024") — so it contributes zero data
2. **Sportradar** only has data from season schedules. If matches on April 1-2 are from competitions not in the config (e.g. Champions League, Europa League, Eredivisie, Dutch football), they won't appear
3. **No Champions League, Europa League, or Eredivisie** are configured in either sync function

## Proposed Solution: Web Scraping for Match Data + News

Create a new edge function that scrapes the requested Dutch football websites to fill in today's matches and enrich AI predictions with current news. This requires the **Firecrawl connector** for reliable web scraping.

### Phase 1: Connect Firecrawl and Create Scraping Functions

**1a. Set up Firecrawl connector**
- Link the Firecrawl connector to the project for web scraping capabilities

**1b. Create `supabase/functions/scrape-matches/index.ts`**
- Scrape `https://www.iservoetbalvanavond.nl/` for today's match schedule (teams, times, competitions)
- Scrape `https://www.vi.nl/wedstrijden` for upcoming match data across all competitions
- Parse the scraped content using AI (Gemini) to extract structured match data: home team, away team, date, time, competition
- Upsert new matches into the database, cross-matching teams by name

**1c. Create `supabase/functions/scrape-news/index.ts`**
- Scrape `https://www.vi.nl/nieuws/net-binnen` for latest football news
- Store relevant headlines and summaries
- Feed this news context into the AI prediction function to improve accuracy (e.g. injury news, transfers, team form)

### Phase 2: Add Missing Competitions to Sportradar Sync

Add these competitions that are currently missing:
- **Champions League** (`sr:competition:7`)
- **Europa League** (`sr:competition:679`)
- **Eredivisie** (`sr:competition:37`) — Dutch league

Update `sync-sportradar-data/index.ts` and `LeagueFilter.tsx` accordingly.

### Phase 3: Integrate News into AI Predictions

Update `batch-generate-predictions` to include scraped news as additional context when generating predictions, improving accuracy with real-time injury/transfer/form data.

## Files Changed

| File | Change |
|---|---|
| `supabase/functions/scrape-matches/index.ts` | New: Firecrawl-powered match scraper for Dutch football sites |
| `supabase/functions/scrape-news/index.ts` | New: Firecrawl-powered news scraper for VI.nl |
| `supabase/functions/sync-sportradar-data/index.ts` | Add Champions League, Europa League, Eredivisie season IDs |
| `supabase/functions/batch-generate-predictions/index.ts` | Include scraped news context in AI prediction prompts |
| `src/components/LeagueFilter.tsx` | Add Champions League, Europa League, Eredivisie filter buttons |
| `src/hooks/useSportradar.ts` | Add new league keys |
| `src/lib/seasons.ts` | Add new season entries |

## Prerequisites

The Firecrawl connector must be linked to the project first. This provides the `FIRECRAWL_API_KEY` secret needed for web scraping.

## Technical Detail

The scraping flow:
1. Firecrawl fetches the page as markdown
2. AI (Gemini) parses the markdown to extract structured match data
3. Teams are matched against existing DB records by name (using the alias system)
4. New teams are created if not found
5. Matches are inserted with proper competition labels

For news: headlines are stored and passed as context to the prediction AI, e.g. "Key context: Arsenal midfielder injured for 3 weeks (source: VI.nl)" — this helps the AI make better-informed predictions.

