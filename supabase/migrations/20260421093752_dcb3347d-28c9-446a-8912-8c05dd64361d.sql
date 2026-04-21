
-- Phase 1: Feature snapshot storage
ALTER TABLE public.predictions
  ADD COLUMN IF NOT EXISTS feature_snapshot JSONB,
  ADD COLUMN IF NOT EXISTS training_only BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_predictions_training_only
  ON public.predictions(training_only) WHERE training_only = false;

CREATE INDEX IF NOT EXISTS idx_predictions_feature_snapshot_present
  ON public.predictions((feature_snapshot IS NOT NULL));

-- Phase 4: Data integrity
-- Clean orphans first
DELETE FROM public.predictions WHERE match_id NOT IN (SELECT id FROM public.matches);
DELETE FROM public.match_features WHERE match_id NOT IN (SELECT id FROM public.matches);
DELETE FROM public.prediction_reviews WHERE match_id NOT IN (SELECT id FROM public.matches);

-- Add prediction_id to prediction_reviews
ALTER TABLE public.prediction_reviews
  ADD COLUMN IF NOT EXISTS prediction_id uuid;

UPDATE public.prediction_reviews pr
   SET prediction_id = p.id
  FROM public.predictions p
 WHERE p.match_id = pr.match_id
   AND pr.prediction_id IS NULL;

-- Foreign keys (guarded)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'predictions_match_id_fkey') THEN
    ALTER TABLE public.predictions
      ADD CONSTRAINT predictions_match_id_fkey
      FOREIGN KEY (match_id) REFERENCES public.matches(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'match_features_match_id_fkey') THEN
    ALTER TABLE public.match_features
      ADD CONSTRAINT match_features_match_id_fkey
      FOREIGN KEY (match_id) REFERENCES public.matches(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'prediction_reviews_prediction_id_fkey') THEN
    ALTER TABLE public.prediction_reviews
      ADD CONSTRAINT prediction_reviews_prediction_id_fkey
      FOREIGN KEY (prediction_id) REFERENCES public.predictions(id) ON DELETE SET NULL;
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_predictions_match_id ON public.predictions(match_id);
CREATE INDEX IF NOT EXISTS idx_match_features_match_id ON public.match_features(match_id);
CREATE INDEX IF NOT EXISTS idx_prediction_reviews_prediction_id ON public.prediction_reviews(prediction_id);
