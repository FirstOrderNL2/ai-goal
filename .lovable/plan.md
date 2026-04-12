

# Football Intelligence Layer (FIL) — Implementation Plan

## What Already Exists

The platform already has two enrichment mechanisms:
- `enrich-match-context`: Extracts flat numeric signals (injury count, sentiment score, weather impact) into `match_enrichment`
- `generate-ai-prediction`: Contains inline momentum detection, news signal parsing, and match importance logic, but these are embedded in the prompt — not stored or reusable

The FIL will consolidate and significantly expand these into a **single, structured intelligence report** stored per match, consumed by both the statistical and AI prediction engines.

## Architecture

```text
  match_context + match_enrichment + match_features + odds + form
                        │
                        ▼
            ┌───────────────────────┐
            │  football-intelligence │  NEW edge function
            │  (AI-powered analysis) │
            └───────────┬───────────┘
                        │
                        ▼
            ┌───────────────────────┐
            │  match_intelligence    │  NEW table (structured JSON)
            │  (FIL report)         │
            └───────────┬───────────┘
                   ┌────┴────┐
                   ▼         ▼
     generate-statistical   generate-ai-prediction
     (confidence boost)     (enriched prompt context)
                   │
                   ▼
              Frontend
         (Intelligence Card)
```

## Step 1: Create `match_intelligence` table

Stores the full FIL report as structured JSON per match.

| Column | Type | Purpose |
|--------|------|---------|
| id | uuid PK | |
| match_id | uuid UNIQUE | FK to matches |
| player_impacts | jsonb | Array of player impact objects (importance 0-100, influence rating, availability) |
| tactical_analysis | jsonb | Formations, style matchups, tactical advantage score |
| momentum_home | integer (0-100) | Home team momentum score |
| momentum_away | integer (0-100) | Away team momentum score |
| market_signal | jsonb | Market alignment score, upset probability |
| match_narrative | text | AI-generated "football story" |
| context_summary | text | Short natural-language summary |
| confidence_adjustment | numeric | Suggested confidence delta (-0.1 to +0.1) |
| generated_at | timestamptz | |

RLS: public SELECT.

## Step 2: Create `football-intelligence` edge function

A new edge function that:

1. Reads all existing data for a match: `match_context`, `match_enrichment`, `match_features`, `odds`, recent form (last 10 matches), H2H history
2. Sends a structured prompt to Lovable AI (Gemini Flash) with tool calling to extract the FIL report as structured JSON
3. The AI produces:
   - **Player impacts**: For each injured/suspended/returning player, scores importance (0-100) and describes match influence
   - **Tactical analysis**: Formation matchup assessment, style conflict indicators, tactical advantage score
   - **Momentum scores**: 0-100 per team based on streaks, recent results, and context
   - **Market signal**: Compares statistical prediction vs odds to produce alignment score and upset probability
   - **Match narrative**: 2-3 sentence "football story" explaining what's happening
   - **Confidence adjustment**: A delta value (-0.1 to +0.1) based on how much contextual evidence supports or undermines the statistical prediction
4. Upserts into `match_intelligence`
5. Caches for 30 minutes (skip if recently generated)

The market signal computation is done deterministically (no AI needed) by comparing Poisson probabilities against implied odds.

## Step 3: Integrate into prediction engines

**`generate-statistical-prediction`** (+10 lines):
- Read `match_intelligence` alongside existing `match_enrichment`
- Apply `confidence_adjustment` to the final confidence score (capped at ±0.1)
- This does NOT change lambdas or probabilities — only confidence calibration

**`generate-ai-prediction`** (+20 lines):
- Read `match_intelligence` and inject `match_narrative`, `tactical_analysis`, and `player_impacts` into the AI prompt
- This gives the AI richer context without changing the statistical backbone

## Step 4: Wire into pipeline

**`pre-match-predictions`**: After calling `enrich-match-context`, call `football-intelligence` before generating predictions. Only for matches within 24 hours of kickoff.

**`auto-sync`**: Trigger FIL during `pre_match` mode alongside existing enrichment.

## Step 5: Frontend — Intelligence Card

Create a new `FootballIntelligenceCard` component displayed on the match detail page:
- Match narrative as a highlighted quote
- Player impact badges (colored by importance: red for 80+, amber for 50-79, green for under 50)
- Tactical matchup visualization (formations side by side, advantage indicator)
- Momentum meters (0-100 bars for each team)
- Market alignment badge (agree/diverge/strong diverge)

## What This Does NOT Change

- Core Poisson model: untouched (lambdas, 1X2, O/U, BTTS all computed identically)
- Existing enrichment layer: still runs independently, FIL reads its output
- Feedback loop: unchanged
- If FIL data is unavailable, everything works exactly as today

## Files Changed

| File | Change |
|------|--------|
| New migration | Create `match_intelligence` table |
| New `supabase/functions/football-intelligence/index.ts` | FIL edge function |
| `supabase/functions/generate-statistical-prediction/index.ts` | +10 lines: read intelligence, apply confidence adjustment |
| `supabase/functions/generate-ai-prediction/index.ts` | +20 lines: inject narrative and tactical context into prompt |
| `supabase/functions/pre-match-predictions/index.ts` | +5 lines: call FIL after enrichment |
| `supabase/functions/auto-sync/index.ts` | +3 lines: trigger FIL in pre_match mode |
| New `src/components/FootballIntelligenceCard.tsx` | Frontend display |
| `src/pages/MatchDetail.tsx` | Add FootballIntelligenceCard to match detail page |

