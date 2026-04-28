-- Phase 1: Immutable prediction runs + match labels

-- 1. prediction_runs (append-only)
CREATE TABLE IF NOT EXISTS public.prediction_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  match_id UUID NOT NULL,
  run_type TEXT NOT NULL CHECK (run_type IN ('pre_match','t_minus_60','t_minus_15','halftime','live','post_match')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  prediction_cutoff_ts TIMESTAMPTZ NOT NULL,
  model_version TEXT NOT NULL DEFAULT 'baseline-v1',
  feature_version TEXT NOT NULL DEFAULT 'v1',
  artifact_version TEXT,
  feature_snapshot JSONB,
  probabilities JSONB NOT NULL DEFAULT '{}'::jsonb,
  expected_goals JSONB NOT NULL DEFAULT '{}'::jsonb,
  score_distribution JSONB,
  publish_status TEXT NOT NULL DEFAULT 'published',
  training_only BOOLEAN NOT NULL DEFAULT false,
  source_function TEXT,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_prediction_runs_match ON public.prediction_runs(match_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_prediction_runs_type ON public.prediction_runs(run_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_prediction_runs_model ON public.prediction_runs(model_version);
CREATE UNIQUE INDEX IF NOT EXISTS uq_prediction_runs_match_type_model_cutoff
  ON public.prediction_runs(match_id, run_type, model_version, prediction_cutoff_ts);

ALTER TABLE public.prediction_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view prediction runs"
  ON public.prediction_runs FOR SELECT
  USING (true);

-- No INSERT/UPDATE/DELETE policies → only service role can write (immutable from clients)

-- 2. match_labels (truth)
CREATE TABLE IF NOT EXISTS public.match_labels (
  match_id UUID NOT NULL PRIMARY KEY,
  goals_home INTEGER NOT NULL,
  goals_away INTEGER NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('home','draw','away')),
  btts BOOLEAN NOT NULL,
  total_goals INTEGER NOT NULL,
  over_05 BOOLEAN NOT NULL,
  over_15 BOOLEAN NOT NULL,
  over_25 BOOLEAN NOT NULL,
  over_35 BOOLEAN NOT NULL,
  finalized_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source TEXT NOT NULL DEFAULT 'auto-sync'
);

CREATE INDEX IF NOT EXISTS idx_match_labels_finalized ON public.match_labels(finalized_at DESC);

ALTER TABLE public.match_labels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view match labels"
  ON public.match_labels FOR SELECT
  USING (true);

-- 3. Pointer from serving projection to current run
ALTER TABLE public.predictions
  ADD COLUMN IF NOT EXISTS current_run_id UUID,
  ADD COLUMN IF NOT EXISTS model_version TEXT;

CREATE INDEX IF NOT EXISTS idx_predictions_current_run ON public.predictions(current_run_id);
