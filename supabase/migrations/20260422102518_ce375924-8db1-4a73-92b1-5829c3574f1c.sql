
-- 1. snapshot_version column on predictions
ALTER TABLE public.predictions
  ADD COLUMN IF NOT EXISTS snapshot_version text NOT NULL DEFAULT 'v1';

-- Backfill historical rows to v0 (legacy schema marker). Safe to run repeatedly.
UPDATE public.predictions
SET snapshot_version = 'v0'
WHERE snapshot_version = 'v1'
  AND created_at < now() - interval '1 minute';

-- 2. ml_ready_predictions view: canonical training source
DROP VIEW IF EXISTS public.ml_ready_predictions;
CREATE VIEW public.ml_ready_predictions
WITH (security_invoker = true)
AS
SELECT
  p.id,
  p.match_id,
  p.created_at,
  p.snapshot_version,
  p.feature_snapshot,
  p.home_win,
  p.draw,
  p.away_win,
  p.expected_goals_home,
  p.expected_goals_away,
  p.predicted_score_home,
  p.predicted_score_away,
  p.over_under_25,
  p.btts,
  p.model_confidence,
  m.match_date,
  m.league,
  m.status AS match_status,
  m.goals_home,
  m.goals_away
FROM public.predictions p
JOIN public.matches m ON m.id = p.match_id
WHERE p.created_at <= m.match_date
  AND p.feature_snapshot IS NOT NULL;

GRANT SELECT ON public.ml_ready_predictions TO anon, authenticated;

-- 3. data_integrity_v: single-row health metrics
DROP VIEW IF EXISTS public.data_integrity_v;
CREATE VIEW public.data_integrity_v
WITH (security_invoker = true)
AS
WITH late_enrich AS (
  SELECT count(*) AS c
  FROM public.match_enrichment me
  JOIN public.matches m ON m.id = me.match_id
  WHERE me.enriched_at > m.match_date AND me.frozen_at IS NULL
),
late_intel AS (
  SELECT count(*) AS c
  FROM public.match_intelligence mi
  JOIN public.matches m ON m.id = mi.match_id
  WHERE mi.generated_at > m.match_date AND mi.frozen_at IS NULL
),
late_pred AS (
  SELECT count(*) AS c
  FROM public.predictions p
  JOIN public.matches m ON m.id = p.match_id
  WHERE p.created_at > m.match_date
),
coverage AS (
  SELECT
    count(*) AS total,
    count(*) FILTER (WHERE EXISTS (
      SELECT 1 FROM public.predictions p WHERE p.match_id = m.id
    )) AS covered
  FROM public.matches m
  WHERE m.status = 'upcoming'
    AND m.match_date >= now()
    AND m.match_date <= now() + interval '24 hours'
),
recheck AS (
  SELECT jsonb_object_agg(coalesce(update_reason, 'null'), c) AS dist
  FROM (
    SELECT update_reason, count(*) AS c
    FROM public.prediction_logs
    WHERE created_at > now() - interval '24 hours'
    GROUP BY update_reason
  ) sub
)
SELECT
  (SELECT c FROM late_enrich)::int  AS late_enrichment_count,
  (SELECT c FROM late_intel)::int   AS late_intelligence_count,
  (SELECT c FROM late_pred)::int    AS late_predictions_count,
  CASE
    WHEN (SELECT total FROM coverage) = 0 THEN 100::float
    ELSE round(((SELECT covered FROM coverage)::float / (SELECT total FROM coverage)) * 100)::float
  END AS prediction_coverage_24h_pct,
  (SELECT total FROM coverage)::int AS upcoming_24h_total,
  COALESCE((SELECT dist FROM recheck), '{}'::jsonb) AS recheck_distribution_24h;

GRANT SELECT ON public.data_integrity_v TO anon, authenticated;
