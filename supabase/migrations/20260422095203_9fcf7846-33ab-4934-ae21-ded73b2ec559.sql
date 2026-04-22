CREATE OR REPLACE VIEW public.ml_readiness_v AS
SELECT
  (SELECT COUNT(*) FROM public.prediction_reviews WHERE actual_outcome IS NOT NULL) AS labeled_samples,
  (SELECT COUNT(*) FROM public.predictions WHERE feature_snapshot IS NOT NULL) AS feature_snapshots,
  CASE
    WHEN (SELECT COUNT(*) FROM public.predictions WHERE feature_snapshot IS NOT NULL) = 0 THEN 0::float
    ELSE (SELECT COUNT(*) FROM public.prediction_reviews WHERE actual_outcome IS NOT NULL)::float
       / (SELECT COUNT(*) FROM public.predictions WHERE feature_snapshot IS NOT NULL)
  END AS label_coverage,
  CASE
    WHEN (SELECT COUNT(*) FROM public.prediction_reviews WHERE actual_outcome IS NOT NULL) >= 2000 THEN 'ready'
    ELSE 'collecting'
  END AS ml_status,
  GREATEST(0, 2000 - (SELECT COUNT(*) FROM public.prediction_reviews WHERE actual_outcome IS NOT NULL)) AS samples_to_target;

GRANT SELECT ON public.ml_readiness_v TO anon, authenticated;