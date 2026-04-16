
ALTER TABLE public.matches
ADD COLUMN IF NOT EXISTS competition_type text DEFAULT 'league',
ADD COLUMN IF NOT EXISTS match_stage text DEFAULT 'regular',
ADD COLUMN IF NOT EXISTS match_importance numeric DEFAULT 0.5;
