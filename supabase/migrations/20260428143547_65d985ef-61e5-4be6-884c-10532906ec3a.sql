-- Phase 2: Online learning state

CREATE TABLE IF NOT EXISTS public.team_rating_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id UUID NOT NULL,
  match_id UUID NOT NULL,
  league TEXT,
  rating_winloss_before NUMERIC NOT NULL DEFAULT 1500,
  rating_winloss_after NUMERIC NOT NULL DEFAULT 1500,
  attack_before NUMERIC NOT NULL DEFAULT 1.0,
  attack_after NUMERIC NOT NULL DEFAULT 1.0,
  defense_before NUMERIC NOT NULL DEFAULT 1.0,
  defense_after NUMERIC NOT NULL DEFAULT 1.0,
  home_adv_context NUMERIC,
  is_home BOOLEAN NOT NULL,
  goals_for INTEGER NOT NULL,
  goals_against INTEGER NOT NULL,
  k_factor NUMERIC NOT NULL DEFAULT 20,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_team_rating_team ON public.team_rating_history(team_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_team_rating_match ON public.team_rating_history(match_id);
CREATE INDEX IF NOT EXISTS idx_team_rating_league ON public.team_rating_history(league, updated_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_team_rating_team_match ON public.team_rating_history(team_id, match_id);

ALTER TABLE public.team_rating_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view team rating history"
  ON public.team_rating_history FOR SELECT
  USING (true);

CREATE TABLE IF NOT EXISTS public.calibration_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  prediction_run_id UUID NOT NULL,
  match_id UUID NOT NULL,
  market TEXT NOT NULL CHECK (market IN ('1x2_home','1x2_draw','1x2_away','btts','over_15','over_25','over_35')),
  predicted_probability NUMERIC NOT NULL,
  actual_outcome BOOLEAN NOT NULL,
  league TEXT,
  bucket TEXT NOT NULL,
  model_version TEXT NOT NULL DEFAULT 'baseline-v1',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_calib_market_bucket ON public.calibration_events(market, bucket);
CREATE INDEX IF NOT EXISTS idx_calib_league ON public.calibration_events(league, market);
CREATE INDEX IF NOT EXISTS idx_calib_model ON public.calibration_events(model_version, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_calib_run_market ON public.calibration_events(prediction_run_id, market);

ALTER TABLE public.calibration_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view calibration events"
  ON public.calibration_events FOR SELECT
  USING (true);
