
CREATE TABLE public.match_enrichment (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  key_player_missing_home integer DEFAULT 0,
  key_player_missing_away integer DEFAULT 0,
  news_sentiment_home numeric DEFAULT 0,
  news_sentiment_away numeric DEFAULT 0,
  lineup_confirmed boolean DEFAULT false,
  formation_home text,
  formation_away text,
  weather_impact numeric DEFAULT 0,
  odds_movement_home numeric DEFAULT 0,
  odds_movement_away numeric DEFAULT 0,
  referee_cards_avg numeric,
  social_sentiment numeric DEFAULT 0,
  enriched_at timestamptz NOT NULL DEFAULT now(),
  sources jsonb DEFAULT '[]'::jsonb,
  CONSTRAINT match_enrichment_match_id_key UNIQUE (match_id)
);

ALTER TABLE public.match_enrichment ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view match enrichment"
  ON public.match_enrichment
  FOR SELECT
  USING (true);
