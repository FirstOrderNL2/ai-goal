
-- ===== Phase 4: Model Registry & Promotion =====

CREATE TABLE public.model_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_family text NOT NULL,
  feature_version text NOT NULL,
  dataset_version text NOT NULL,
  hyperparameters jsonb NOT NULL DEFAULT '{}'::jsonb,
  weights jsonb NOT NULL DEFAULT '{}'::jsonb,
  train_window_start timestamptz,
  train_window_end timestamptz,
  validation_window_start timestamptz,
  validation_window_end timestamptz,
  holdout_window_start timestamptz,
  holdout_window_end timestamptz,
  n_train integer DEFAULT 0,
  n_val integer DEFAULT 0,
  n_holdout integer DEFAULT 0,
  metrics_json jsonb DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'shadow',
  created_by_job_id uuid,
  promoted_at timestamptz,
  rolled_back_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT model_artifacts_status_chk CHECK (status IN ('shadow','champion','archived','rolled_back'))
);

CREATE INDEX idx_model_artifacts_family_status ON public.model_artifacts (model_family, status, created_at DESC);
CREATE INDEX idx_model_artifacts_created ON public.model_artifacts (created_at DESC);

ALTER TABLE public.model_artifacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view model artifacts" ON public.model_artifacts FOR SELECT USING (true);

CREATE TABLE public.model_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_family text NOT NULL UNIQUE,
  champion_artifact_id uuid REFERENCES public.model_artifacts(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.model_registry ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view model registry" ON public.model_registry FOR SELECT USING (true);

CREATE TABLE public.evaluation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artifact_id uuid NOT NULL REFERENCES public.model_artifacts(id) ON DELETE CASCADE,
  champion_artifact_id uuid REFERENCES public.model_artifacts(id) ON DELETE SET NULL,
  window_start timestamptz NOT NULL,
  window_end timestamptz NOT NULL,
  n_examples integer NOT NULL DEFAULT 0,
  metrics_challenger jsonb NOT NULL DEFAULT '{}'::jsonb,
  metrics_champion jsonb DEFAULT '{}'::jsonb,
  per_league_json jsonb DEFAULT '{}'::jsonb,
  passes_gate boolean NOT NULL DEFAULT false,
  gate_reasons jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_evaluation_runs_artifact ON public.evaluation_runs (artifact_id, created_at DESC);

ALTER TABLE public.evaluation_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view evaluation runs" ON public.evaluation_runs FOR SELECT USING (true);

CREATE TABLE public.shadow_predictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prediction_run_id uuid NOT NULL,
  artifact_id uuid NOT NULL REFERENCES public.model_artifacts(id) ON DELETE CASCADE,
  probabilities jsonb NOT NULL DEFAULT '{}'::jsonb,
  expected_goals jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT shadow_predictions_unique UNIQUE (prediction_run_id, artifact_id)
);

CREATE INDEX idx_shadow_predictions_artifact ON public.shadow_predictions (artifact_id, created_at DESC);

ALTER TABLE public.shadow_predictions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view shadow predictions" ON public.shadow_predictions FOR SELECT USING (true);

-- ===== Phase 5: Pipeline Health Monitoring =====

CREATE TABLE public.pipeline_health (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  check_type text NOT NULL,
  severity text NOT NULL DEFAULT 'info',
  message text NOT NULL,
  details jsonb DEFAULT '{}'::jsonb,
  acknowledged_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pipeline_health_severity_chk CHECK (severity IN ('info','warn','error'))
);

CREATE INDEX idx_pipeline_health_created ON public.pipeline_health (created_at DESC);
CREATE INDEX idx_pipeline_health_unack ON public.pipeline_health (created_at DESC) WHERE acknowledged_at IS NULL;

ALTER TABLE public.pipeline_health ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view pipeline health" ON public.pipeline_health FOR SELECT USING (true);

-- Seed the registry with the baseline family (no champion yet — production still serves the in-code Poisson baseline)
INSERT INTO public.model_registry (model_family) VALUES ('1x2_baseline') ON CONFLICT (model_family) DO NOTHING;
