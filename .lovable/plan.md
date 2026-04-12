

# Data Enrichment Layer for GoalGPT

## Current State Summary

The system already has significant infrastructure for context enrichment:
- `fetch-match-context` already scrapes via Firecrawl (WhoScored previews, injury news, lineup searches) and uses AI to extract structured data (injuries, lineups, suspensions, weather, news)
- `match_context` table stores this structured data
- `generate-ai-prediction` uses this context for AI reasoning
- **However**, `generate-statistical-prediction` (the core Poisson engine) does NOT read `match_context` at all — it only uses `match_features`, `odds`, form history, and model weights

The enrichment layer will bridge this gap by creating a new edge function that reads `match_context` + scrapes additional sources, produces numeric adjustment signals, and feeds them into the statistical prediction engine.

---

## Architecture

```text
                     ┌──────────────────────────┐
                     │   enrich-match-context    │  NEW edge function
                     │  (scrapes + NLP scoring)  │
                     └──────────┬───────────────┘
                                │
                                ▼
                     ┌──────────────────────────┐
                     │   match_enrichment table  │  NEW table
                     │  (structured signals)     │
                     └──────────┬───────────────┘
                                │ read by
                                ▼
                     ┌──────────────────────────┐
                     │ generate-statistical-     │  EXISTING (add ~30 lines)
                     │ prediction                │  reads enrichment signals
                     └──────────────────────────┘
```

---

## Step 1: Create `match_enrichment` table

New table to store numeric enrichment signals per match:

| Column | Type | Purpose |
|--------|------|---------|
| match_id | uuid (unique) | FK to matches |
| key_player_missing_home | integer | Count of key absentees (home) |
| key_player_missing_away | integer | Count of key absentees (away) |
| news_sentiment_home | numeric (-1 to 1) | NLP sentiment score |
| news_sentiment_away | numeric (-1 to 1) | NLP sentiment score |
| lineup_confirmed | boolean | Whether lineups are confirmed |
| formation_home | text | e.g. "4-3-3" |
| formation_away | text | e.g. "4-3-3" |
| weather_impact | numeric (0-1) | 0 = no impact, 1 = severe (rain/wind) |
| odds_movement_home | numeric | Change from opening to current odds |
| odds_movement_away | numeric | Change from opening to current odds |
| referee_cards_avg | numeric | Cards per match for assigned referee |
| social_sentiment | numeric (-1 to 1) | Optional social signal |
| enriched_at | timestamptz | Last enrichment time |
| sources | jsonb | Which sources contributed |

RLS: public SELECT (read-only for frontend).

## Step 2: Create `enrich-match-context` edge function

A new modular edge function that:

1. Takes a `match_id`
2. Reads existing `match_context` data (injuries, lineups, news)
3. Scrapes additional sources via Firecrawl:
   - BBC Sport, ESPN, Goal.com for team news sentiment
   - Transfermarkt for injury updates
   - OddsPortal for odds movement
4. Uses Lovable AI to extract structured signals:
   - Sentiment scoring per team (-1 to +1)
   - Key player impact assessment (count of starters missing)
   - Weather impact scoring
5. Upserts results into `match_enrichment`

Rate limiting: max 3 Firecrawl calls per match, cached for 30 minutes (skip if `enriched_at` is recent).

## Step 3: Integrate signals into `generate-statistical-prediction`

Add ~30 lines to the existing prediction engine (after lambda computation, before confidence calculation):

- **Key player missing**: If home team has 2+ key players out, reduce `lambdaHome` by 5-10%. Same for away.
- **News sentiment**: If strongly negative for a team (< -0.5), reduce their lambda by 3%.
- **Weather impact**: If high (> 0.7), reduce both lambdas slightly (defensive conditions favor under).
- **Odds movement**: If odds shortened significantly for one side, boost that side's confidence.
- **All adjustments are ADDITIVE to existing logic, never replacing it.**
- **If no enrichment data exists, skip entirely (graceful fallback).**

## Step 4: Wire into the pipeline

Modify `pre-match-predictions` to call `enrich-match-context` before `generate-statistical-prediction` for matches within 24 hours of kickoff.

Modify `auto-sync` to trigger enrichment during `pre_match` mode (matches within 60 min).

## Step 5: Frontend display

Add an "Enrichment Signals" section to the existing `MatchContextCard` component showing:
- Key player absences with impact badges
- News sentiment indicator
- Weather conditions
- Odds movement arrows

---

## What This Does NOT Change

- The core Poisson model remains untouched
- The feedback loop (reviews -> weights -> recalibration) is unchanged
- `generate-ai-prediction` continues to work independently
- If enrichment data is unavailable, predictions generate exactly as they do today

## Files Changed

| File | Change |
|------|--------|
| New migration | Create `match_enrichment` table |
| New `supabase/functions/enrich-match-context/index.ts` | Enrichment edge function |
| `supabase/functions/generate-statistical-prediction/index.ts` | +30 lines to read & apply enrichment signals |
| `supabase/functions/pre-match-predictions/index.ts` | Call enrichment before prediction |
| `src/components/MatchContextCard.tsx` | Display enrichment signals |

## Estimated Impact

- Enrichment signals should improve 1X2 accuracy by 2-5pp through lineup/injury awareness
- O/U accuracy should benefit from weather and key player absence signals
- Confidence calibration improves as more data quality factors are included

