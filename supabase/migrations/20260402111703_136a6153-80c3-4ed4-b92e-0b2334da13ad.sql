
-- Create leagues table
CREATE TABLE public.leagues (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  api_football_id integer UNIQUE NOT NULL,
  name text NOT NULL,
  country text NOT NULL,
  season integer NOT NULL,
  logo_url text,
  standings_data jsonb,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.leagues ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view leagues" ON public.leagues FOR SELECT USING (true);

-- Create team_statistics table
CREATE TABLE public.team_statistics (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  league_id uuid NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  season integer NOT NULL,
  matches_played integer NOT NULL DEFAULT 0,
  wins integer NOT NULL DEFAULT 0,
  draws integer NOT NULL DEFAULT 0,
  losses integer NOT NULL DEFAULT 0,
  goals_for integer NOT NULL DEFAULT 0,
  goals_against integer NOT NULL DEFAULT 0,
  goal_diff integer NOT NULL DEFAULT 0,
  form text,
  home_record jsonb DEFAULT '{}'::jsonb,
  away_record jsonb DEFAULT '{}'::jsonb,
  clean_sheets integer NOT NULL DEFAULT 0,
  failed_to_score integer NOT NULL DEFAULT 0,
  avg_goals_scored numeric NOT NULL DEFAULT 0,
  avg_goals_conceded numeric NOT NULL DEFAULT 0,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (team_id, league_id, season)
);

ALTER TABLE public.team_statistics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view team statistics" ON public.team_statistics FOR SELECT USING (true);

-- Create match_features table
CREATE TABLE public.match_features (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  match_id uuid NOT NULL UNIQUE REFERENCES public.matches(id) ON DELETE CASCADE,
  home_form_last5 text,
  away_form_last5 text,
  home_avg_scored numeric DEFAULT 0,
  home_avg_conceded numeric DEFAULT 0,
  away_avg_scored numeric DEFAULT 0,
  away_avg_conceded numeric DEFAULT 0,
  h2h_results jsonb,
  league_position_home integer,
  league_position_away integer,
  position_diff integer,
  home_clean_sheet_pct numeric DEFAULT 0,
  away_clean_sheet_pct numeric DEFAULT 0,
  home_btts_pct numeric DEFAULT 0,
  away_btts_pct numeric DEFAULT 0,
  poisson_xg_home numeric DEFAULT 0,
  poisson_xg_away numeric DEFAULT 0,
  computed_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.match_features ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view match features" ON public.match_features FOR SELECT USING (true);

-- Create indexes for performance
CREATE INDEX idx_team_statistics_team_id ON public.team_statistics(team_id);
CREATE INDEX idx_team_statistics_league_id ON public.team_statistics(league_id);
CREATE INDEX idx_match_features_match_id ON public.match_features(match_id);
CREATE INDEX idx_leagues_api_football_id ON public.leagues(api_football_id);
