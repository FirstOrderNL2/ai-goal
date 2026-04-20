ALTER TABLE public.predictions
  ADD COLUMN IF NOT EXISTS publish_status text NOT NULL DEFAULT 'published',
  ADD COLUMN IF NOT EXISTS quality_score numeric;

CREATE INDEX IF NOT EXISTS idx_predictions_publish_status ON public.predictions (publish_status);