
ALTER TABLE public.predictions
  ADD COLUMN IF NOT EXISTS generation_status text NOT NULL DEFAULT 'success',
  ADD COLUMN IF NOT EXISTS retry_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error text,
  ADD COLUMN IF NOT EXISTS update_reason text DEFAULT 'initial';

CREATE INDEX IF NOT EXISTS idx_predictions_generation_status ON public.predictions(generation_status);
CREATE INDEX IF NOT EXISTS idx_predictions_last_prediction_at ON public.predictions(last_prediction_at DESC);

CREATE TABLE IF NOT EXISTS public.prediction_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid,
  action text NOT NULL,
  status text NOT NULL,
  error text,
  update_reason text,
  latency_ms integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prediction_logs_match_id ON public.prediction_logs(match_id);
CREATE INDEX IF NOT EXISTS idx_prediction_logs_created_at ON public.prediction_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_prediction_logs_status ON public.prediction_logs(status);

ALTER TABLE public.prediction_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view prediction logs"
  ON public.prediction_logs
  FOR SELECT
  USING (true);
