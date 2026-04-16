
-- Add model versioning and learning cycle tracking columns
ALTER TABLE public.model_performance
  ADD COLUMN IF NOT EXISTS model_version integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS validation_result text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS last_learning_match_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS calibration_corrections jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS error_weights jsonb DEFAULT '{}'::jsonb;
