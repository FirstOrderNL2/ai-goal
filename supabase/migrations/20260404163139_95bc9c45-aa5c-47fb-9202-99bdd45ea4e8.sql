ALTER TABLE public.predictions
  ADD COLUMN IF NOT EXISTS last_prediction_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS prediction_intervals jsonb DEFAULT '[]'::jsonb;