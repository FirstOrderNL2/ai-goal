
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS api_football_id integer UNIQUE;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS api_football_id integer UNIQUE;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS round text;
