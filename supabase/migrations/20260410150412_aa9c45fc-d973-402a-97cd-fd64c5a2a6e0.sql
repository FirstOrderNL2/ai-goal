
CREATE TABLE public.user_performance (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  total_votes integer NOT NULL DEFAULT 0,
  correct_votes integer NOT NULL DEFAULT 0,
  accuracy_score numeric NOT NULL DEFAULT 0,
  trust_score numeric NOT NULL DEFAULT 0.5,
  tier text NOT NULL DEFAULT 'low',
  last_updated timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.user_performance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view user performance"
ON public.user_performance FOR SELECT TO public USING (true);

CREATE POLICY "Users can insert own performance"
ON public.user_performance FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own performance"
ON public.user_performance FOR UPDATE TO authenticated USING (auth.uid() = user_id);
