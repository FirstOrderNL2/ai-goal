-- Phase 2.5: latest-per-team serving table
CREATE TABLE IF NOT EXISTS public.team_rating_state (
  team_id UUID NOT NULL PRIMARY KEY,
  league TEXT,
  rating_winloss NUMERIC NOT NULL DEFAULT 1500,
  attack NUMERIC NOT NULL DEFAULT 1.0,
  defense NUMERIC NOT NULL DEFAULT 1.0,
  matches_counted INTEGER NOT NULL DEFAULT 0,
  last_match_id UUID,
  last_match_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_team_rating_state_league
  ON public.team_rating_state(league, rating_winloss DESC);

ALTER TABLE public.team_rating_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view team rating state"
  ON public.team_rating_state FOR SELECT
  USING (true);

-- Backfill from existing history (latest row per team)
INSERT INTO public.team_rating_state (
  team_id, league, rating_winloss, attack, defense,
  matches_counted, last_match_id, last_match_at, updated_at
)
SELECT DISTINCT ON (h.team_id)
  h.team_id, h.league, h.rating_winloss_after, h.attack_after, h.defense_after,
  (SELECT count(*) FROM public.team_rating_history h2 WHERE h2.team_id = h.team_id),
  h.match_id, h.updated_at, now()
FROM public.team_rating_history h
ORDER BY h.team_id, h.updated_at DESC
ON CONFLICT (team_id) DO UPDATE
SET rating_winloss   = EXCLUDED.rating_winloss,
    attack           = EXCLUDED.attack,
    defense          = EXCLUDED.defense,
    league           = EXCLUDED.league,
    last_match_id    = EXCLUDED.last_match_id,
    last_match_at    = EXCLUDED.last_match_at,
    matches_counted  = EXCLUDED.matches_counted,
    updated_at       = now();

-- Phase 3: training_examples
CREATE TABLE IF NOT EXISTS public.training_examples (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  prediction_run_id UUID NOT NULL,
  match_id UUID NOT NULL,
  prediction_cutoff_ts TIMESTAMPTZ NOT NULL,
  feature_snapshot JSONB NOT NULL,
  label_snapshot JSONB NOT NULL,
  model_family TEXT NOT NULL DEFAULT 'baseline',
  dataset_version TEXT NOT NULL DEFAULT 'v1',
  league TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_training_examples_run_family_version
  ON public.training_examples(prediction_run_id, model_family, dataset_version);
CREATE INDEX IF NOT EXISTS idx_training_examples_cutoff
  ON public.training_examples(prediction_cutoff_ts);
CREATE INDEX IF NOT EXISTS idx_training_examples_dataset
  ON public.training_examples(dataset_version, created_at DESC);

ALTER TABLE public.training_examples ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view training examples"
  ON public.training_examples FOR SELECT
  USING (true);

-- Phase 3: training_jobs
CREATE TABLE IF NOT EXISTS public.training_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  model_family TEXT NOT NULL,
  dataset_version TEXT NOT NULL,
  train_window_start TIMESTAMPTZ,
  train_window_end TIMESTAMPTZ,
  holdout_window_start TIMESTAMPTZ,
  holdout_window_end TIMESTAMPTZ,
  n_train INTEGER,
  n_holdout INTEGER,
  status TEXT NOT NULL DEFAULT 'queued',
  metrics_json JSONB,
  champion_metrics_json JSONB,
  decision TEXT,
  notes TEXT,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_training_jobs_status
  ON public.training_jobs(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_training_jobs_family
  ON public.training_jobs(model_family, created_at DESC);

ALTER TABLE public.training_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view training jobs"
  ON public.training_jobs FOR SELECT
  USING (true);
