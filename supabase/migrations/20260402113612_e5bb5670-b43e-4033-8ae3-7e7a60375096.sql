
-- Create players table
CREATE TABLE public.players (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  api_football_id INTEGER UNIQUE NOT NULL,
  team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  position TEXT,
  age INTEGER,
  nationality TEXT,
  photo_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;

-- Public read access
CREATE POLICY "Anyone can view players"
  ON public.players FOR SELECT
  USING (true);

-- Add type column to leagues
ALTER TABLE public.leagues ADD COLUMN type TEXT;

-- Index for fast lookups
CREATE INDEX idx_players_team_id ON public.players(team_id);
CREATE INDEX idx_players_api_football_id ON public.players(api_football_id);
