DROP VIEW IF EXISTS public.ml_readiness_v;

CREATE VIEW public.ml_readiness_v
WITH (security_invoker = true)
AS
WITH true_labels AS (
  SELECT pr.id
  FROM public.prediction_reviews pr
  JOIN public.predictions p ON p.match_id = pr.match_id
  JOIN public.matches m ON m.id = pr.match_id
  WHERE pr.actual_outcome IS NOT NULL
    AND p.feature_snapshot IS NOT NULL
    AND p.created_at <= m.match_date
),
true_snaps AS (
  SELECT p.id
  FROM public.predictions p
  JOIN public.matches m ON m.id = p.match_id
  WHERE p.feature_snapshot IS NOT NULL
    AND p.created_at <= m.match_date
)
SELECT
  (SELECT count(*) FROM true_labels) AS labeled_samples,
  (SELECT count(*) FROM true_snaps)  AS feature_snapshots,
  CASE
    WHEN (SELECT count(*) FROM true_snaps) = 0 THEN 0::float
    ELSE (SELECT count(*) FROM true_labels)::float / (SELECT count(*) FROM true_snaps)
  END AS label_coverage,
  CASE
    WHEN (SELECT count(*) FROM true_labels) >= 2000 THEN 'ready'
    ELSE 'collecting'
  END AS ml_status,
  GREATEST(0::bigint, 2000::bigint - (SELECT count(*) FROM true_labels)) AS samples_to_target;

GRANT SELECT ON public.ml_readiness_v TO anon, authenticated;