
CREATE TABLE public.match_context (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE UNIQUE,
  injuries_home jsonb DEFAULT '[]'::jsonb,
  injuries_away jsonb DEFAULT '[]'::jsonb,
  lineup_home jsonb DEFAULT '[]'::jsonb,
  lineup_away jsonb DEFAULT '[]'::jsonb,
  suspensions jsonb DEFAULT '[]'::jsonb,
  weather text,
  h2h_summary text,
  news_items jsonb DEFAULT '[]'::jsonb,
  scraped_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.match_context ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view match context"
  ON public.match_context
  FOR SELECT
  USING (true);
