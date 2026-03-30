
-- Create teams table
CREATE TABLE public.teams (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  league TEXT NOT NULL,
  country TEXT NOT NULL,
  logo_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create matches table
CREATE TABLE public.matches (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  match_date TIMESTAMP WITH TIME ZONE NOT NULL,
  team_home_id UUID NOT NULL REFERENCES public.teams(id),
  team_away_id UUID NOT NULL REFERENCES public.teams(id),
  goals_home INTEGER,
  goals_away INTEGER,
  xg_home NUMERIC(4,2),
  xg_away NUMERIC(4,2),
  status TEXT NOT NULL DEFAULT 'upcoming',
  league TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create predictions table
CREATE TABLE public.predictions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  match_id UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  home_win NUMERIC(4,3) NOT NULL,
  draw NUMERIC(4,3) NOT NULL,
  away_win NUMERIC(4,3) NOT NULL,
  expected_goals_home NUMERIC(4,2) NOT NULL,
  expected_goals_away NUMERIC(4,2) NOT NULL,
  over_under_25 TEXT NOT NULL DEFAULT 'under',
  model_confidence NUMERIC(4,3) NOT NULL DEFAULT 0.500,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(match_id)
);

-- Create odds table
CREATE TABLE public.odds (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  match_id UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  home_win_odds NUMERIC(5,2) NOT NULL,
  draw_odds NUMERIC(5,2) NOT NULL,
  away_win_odds NUMERIC(5,2) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(match_id)
);

-- Enable RLS on all tables (public read access, no auth required for this MVP)
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.odds ENABLE ROW LEVEL SECURITY;

-- Public read policies (no auth needed for viewing predictions)
CREATE POLICY "Anyone can view teams" ON public.teams FOR SELECT USING (true);
CREATE POLICY "Anyone can view matches" ON public.matches FOR SELECT USING (true);
CREATE POLICY "Anyone can view predictions" ON public.predictions FOR SELECT USING (true);
CREATE POLICY "Anyone can view odds" ON public.odds FOR SELECT USING (true);

-- Create indexes for performance
CREATE INDEX idx_matches_date ON public.matches(match_date);
CREATE INDEX idx_matches_status ON public.matches(status);
CREATE INDEX idx_matches_league ON public.matches(league);
CREATE INDEX idx_predictions_match ON public.predictions(match_id);
CREATE INDEX idx_odds_match ON public.odds(match_id);
