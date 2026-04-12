
CREATE TABLE public.match_intelligence (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  player_impacts jsonb DEFAULT '[]'::jsonb,
  tactical_analysis jsonb DEFAULT '{}'::jsonb,
  momentum_home integer DEFAULT 50,
  momentum_away integer DEFAULT 50,
  market_signal jsonb DEFAULT '{}'::jsonb,
  match_narrative text,
  context_summary text,
  confidence_adjustment numeric DEFAULT 0,
  generated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT match_intelligence_match_id_key UNIQUE (match_id)
);

ALTER TABLE public.match_intelligence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view match intelligence"
  ON public.match_intelligence
  FOR SELECT
  USING (true);
