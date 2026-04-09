

# Referee & Card-Based Volatility Model

## Approach

Since API-Football's free/standard tier doesn't provide a dedicated referee statistics endpoint, we'll **derive referee and team discipline data from completed match fixtures** already in our database, supplemented by the referee name from the fixture response (which API-Football includes as `fixture.referee`).

## Changes

### 1. Database: Two new tables + one column on matches

**Migration:**

```sql
-- Store referee name on each match
ALTER TABLE matches ADD COLUMN referee text;

-- Referee aggregate stats (computed, not fetched)
CREATE TABLE referees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  matches_officiated integer DEFAULT 0,
  yellow_avg numeric DEFAULT 0,
  red_avg numeric DEFAULT 0,
  foul_avg numeric DEFAULT 0,
  penalty_avg numeric DEFAULT 0,
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE referees ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view referees" ON referees FOR SELECT TO public USING (true);

-- Team discipline stats (computed from match events)
CREATE TABLE team_discipline (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL,
  season integer NOT NULL,
  yellow_avg numeric DEFAULT 0,
  red_avg numeric DEFAULT 0,
  foul_avg numeric DEFAULT 0,
  matches_counted integer DEFAULT 0,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(team_id, season)
);
ALTER TABLE team_discipline ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view team discipline" ON team_discipline FOR SELECT TO public USING (true);
```

### 2. Sync: Capture referee name + card events from fixtures
**File**: `supabase/functions/sync-football-data/index.ts`

- When upserting upcoming/recent matches, extract `f.fixture.referee` and store in the new `referee` column.
- In `full` mode, for completed matches, fetch `/fixtures/statistics` (already partially done for team stats) and extract yellow/red card totals per team.
- Aggregate into `referees` and `team_discipline` tables.

### 3. New Edge Function: `compute-volatility`
**File**: `supabase/functions/compute-volatility/index.ts`

Computes referee and discipline aggregates from completed matches:
- Query completed matches with referee names, join with events/statistics to count cards.
- Upsert into `referees` table (avg yellow, avg red per referee).
- Upsert into `team_discipline` table (avg yellow, avg red per team per season).
- Called periodically (daily) or after each sync.

### 4. Integrate volatility into statistical prediction
**File**: `supabase/functions/generate-statistical-prediction/index.ts`

After computing Poisson lambdas, fetch:
- Referee stats for this match's referee
- Team discipline for both teams

Compute volatility score:
```
volatility = (referee_strictness * 0.4) + (team_aggression * 0.4) + (match_importance * 0.2)
```

Where:
- `referee_strictness` = normalized (referee yellow_avg / league avg yellow per match)
- `team_aggression` = normalized avg of both teams' yellow_avg
- `match_importance` = 1.0 for knockout/cup, 0.7 for top-of-table, 0.5 otherwise

Apply subtle adjustments (capped at ±5%):
- **Over/Under**: High volatility → +2-3% over probability
- **BTTS**: High volatility → +2% BTTS probability  
- **1X2**: High volatility → reduce favorite margin by 1-2%, increase draw
- **Confidence**: High volatility → -3-5% confidence

Store volatility score in `match_features` (new column `volatility_score`).

### 5. AI Reasoning Integration
**File**: `supabase/functions/generate-ai-prediction/index.ts`

Pass referee stats and volatility score to AI prompt so it can explain:
- "Strict referee (4.2 yellows/game avg) increases chaos risk"
- "Both teams aggressive (combined 5.1 yellows/game), expect a heated match"

### 6. UI: Volatility & Referee Card on Match Detail
**File**: `src/components/VolatilityCard.tsx` (new)

Display:
- Referee name + stats (avg yellows, avg reds)
- Expected yellow cards for this match
- Red card probability (low/medium/high)
- Volatility indicator: 🟢 Low / 🟡 Medium / 🔴 High
- High-risk match flag (⚠️) if volatility > 0.75

**File**: `src/pages/MatchDetail.tsx` — add VolatilityCard to the match detail page.

### 7. Types update
**File**: `src/lib/types.ts` — add `referee` to Match type, add Referee and TeamDiscipline interfaces.

## Data Flow

```text
API-Football fixture.referee ──► matches.referee column
                                      │
compute-volatility (daily) ◄──────────┘
   │
   ├──► referees table (aggregated stats)
   └──► team_discipline table (aggregated stats)
                │
generate-statistical-prediction
   │  reads referee + discipline data
   │  computes volatility_score
   │  applies ±3-5% adjustments to O/U, BTTS, 1X2
   └──► predictions (adjusted probabilities)
                │
generate-ai-prediction
   │  reads volatility context
   └──► ai_reasoning (explains volatility impact)
```

## Files Summary

| File | Action |
|---|---|
| Migration | Add `referee` column to matches, create `referees` + `team_discipline` tables |
| `sync-football-data/index.ts` | Extract `fixture.referee` into matches |
| `supabase/functions/compute-volatility/index.ts` | **New** — aggregate referee/discipline stats |
| `generate-statistical-prediction/index.ts` | Fetch volatility data, apply ±3-5% adjustments |
| `generate-ai-prediction/index.ts` | Pass volatility context to AI prompt |
| `src/components/VolatilityCard.tsx` | **New** — referee stats + volatility display |
| `src/pages/MatchDetail.tsx` | Add VolatilityCard |
| `src/lib/types.ts` | Add referee field + new interfaces |
| `match_features` migration | Add `volatility_score` column |

## Constraints Enforced

- Adjustments capped at ±5% — no over-influence
- Statistical backbone remains source of truth
- Volatility only adjusts probabilities marginally, never overrides
- Referee data derived from own database (no extra API calls needed beyond what sync already does)

