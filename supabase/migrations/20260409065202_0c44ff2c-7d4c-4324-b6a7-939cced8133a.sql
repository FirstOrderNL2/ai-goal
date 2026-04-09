
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

-- Add volatility_score to match_features
ALTER TABLE match_features ADD COLUMN volatility_score numeric DEFAULT NULL;
