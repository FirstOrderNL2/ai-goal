DROP INDEX IF EXISTS public.idx_model_performance_period;
CREATE UNIQUE INDEX idx_model_performance_period_version ON public.model_performance USING btree (period_start, period_end, model_version);