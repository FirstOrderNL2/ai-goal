ALTER TABLE public.match_enrichment
  ADD COLUMN IF NOT EXISTS frozen_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS frozen_for_match_date TIMESTAMPTZ;

ALTER TABLE public.match_intelligence
  ADD COLUMN IF NOT EXISTS frozen_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS frozen_for_match_date TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_match_enrichment_frozen ON public.match_enrichment(match_id, frozen_at);
CREATE INDEX IF NOT EXISTS idx_match_intelligence_frozen ON public.match_intelligence(match_id, frozen_at);