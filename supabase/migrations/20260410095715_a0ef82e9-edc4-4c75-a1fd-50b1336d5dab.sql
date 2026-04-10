
CREATE TABLE prediction_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  predicted_outcome text,
  actual_outcome text,
  outcome_correct boolean,
  ou_correct boolean,
  btts_correct boolean,
  score_correct boolean,
  confidence_at_prediction numeric,
  error_type text,
  goals_error numeric,
  league text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(match_id)
);
ALTER TABLE prediction_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view prediction reviews" ON prediction_reviews FOR SELECT TO public USING (true);

ALTER TABLE model_performance ADD COLUMN numeric_weights jsonb DEFAULT '{}'::jsonb;
