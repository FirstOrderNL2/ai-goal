-- Remove duplicates, keeping only the latest record per (period_start, period_end)
DELETE FROM public.model_performance
WHERE id NOT IN (
  SELECT DISTINCT ON (period_start, period_end) id
  FROM public.model_performance
  ORDER BY period_start, period_end, created_at DESC
);

-- Add unique constraint
CREATE UNIQUE INDEX idx_model_performance_period ON public.model_performance (period_start, period_end);