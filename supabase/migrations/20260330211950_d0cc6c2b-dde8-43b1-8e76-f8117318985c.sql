
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS sportradar_id text UNIQUE;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS sportradar_id text UNIQUE;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS fun_facts text[];
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS ai_insights text;
