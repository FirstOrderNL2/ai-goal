
-- Create prediction_votes table
CREATE TABLE public.prediction_votes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  prediction_id uuid NOT NULL REFERENCES public.predictions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vote_type text NOT NULL CHECK (vote_type IN ('like', 'dislike')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (prediction_id, user_id)
);

-- Enable RLS
ALTER TABLE public.prediction_votes ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Anyone authenticated can view votes"
  ON public.prediction_votes FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert own votes"
  ON public.prediction_votes FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own votes"
  ON public.prediction_votes FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own votes"
  ON public.prediction_votes FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create prediction_comments table
CREATE TABLE public.prediction_comments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  prediction_id uuid NOT NULL REFERENCES public.predictions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  comment text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.prediction_comments ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Anyone authenticated can view comments"
  ON public.prediction_comments FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert own comments"
  ON public.prediction_comments FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own comments"
  ON public.prediction_comments FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.prediction_votes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.prediction_comments;
