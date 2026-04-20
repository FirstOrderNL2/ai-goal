ALTER TABLE public.model_performance
ADD COLUMN IF NOT EXISTS validation_metrics jsonb DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS validation_weights_tested jsonb DEFAULT '{}'::jsonb;