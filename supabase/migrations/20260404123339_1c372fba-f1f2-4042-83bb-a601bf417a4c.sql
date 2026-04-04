
CREATE TABLE public.model_performance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start date NOT NULL,
  period_end date NOT NULL,
  total_matches integer DEFAULT 0,
  outcome_accuracy numeric DEFAULT 0,
  ou_25_accuracy numeric DEFAULT 0,
  btts_accuracy numeric DEFAULT 0,
  exact_score_hits integer DEFAULT 0,
  avg_brier_1x2 numeric DEFAULT 0,
  avg_brier_ou numeric DEFAULT 0,
  avg_brier_btts numeric DEFAULT 0,
  mae_goals numeric DEFAULT 0,
  calibration_data jsonb DEFAULT '{}',
  goal_line_accuracy jsonb DEFAULT '{}',
  feature_weights jsonb DEFAULT '{}',
  weak_areas jsonb DEFAULT '[]',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.model_performance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view model performance"
ON public.model_performance
FOR SELECT
USING (true);
