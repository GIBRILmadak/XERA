-- Fata × XERA1 Production Migration - Refined Fixes & RLS

-- 1. ADD AUDIT COLUMNS TO FATA PENDING EVENTS
ALTER TABLE public.fata_pending_events
  ADD COLUMN IF NOT EXISTS event_id TEXT,
  ADD COLUMN IF NOT EXISTS request_id TEXT,
  ADD COLUMN IF NOT EXISTS fata_iss TEXT NOT NULL DEFAULT 'https://fata.app/oidc';

-- 2. SEED TEST & REAL CHALLENGE CONFIGURATIONS
INSERT INTO public.fata_challenges_config (
  id,
  name,
  is_test,
  req_arc,
  req_preuve,
  req_jalon,
  start_day,
  end_day,
  close_at,
  is_active
) VALUES (
  'xera1-test',
  'Challenge Fata Test',
  true,
  'req_arc',
  'req_preuve',
  'req_jalon',
  1,
  30,
  '2026-11-07T12:00:00Z',
  true
) ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  is_test = EXCLUDED.is_test,
  req_arc = EXCLUDED.req_arc,
  req_preuve = EXCLUDED.req_preuve,
  req_jalon = EXCLUDED.req_jalon,
  close_at = EXCLUDED.close_at,
  is_active = EXCLUDED.is_active;

-- 3. ROW LEVEL SECURITY (RLS) POLICIES
ALTER TABLE public.fata_linkages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fata_pending_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fata_qualifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fata_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fata_challenges_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fata_activity_log ENABLE ROW LEVEL SECURITY;

-- fata_linkages: users can read their own linkage
DROP POLICY IF EXISTS "Users can read own fata linkages" ON public.fata_linkages;
CREATE POLICY "Users can read own fata linkages"
  ON public.fata_linkages
  FOR SELECT
  USING (auth.uid() = user_id);

-- fata_pending_events: users can read their own pending events
DROP POLICY IF EXISTS "Users can read own fata pending events" ON public.fata_pending_events;
CREATE POLICY "Users can read own fata pending events"
  ON public.fata_pending_events
  FOR SELECT
  USING (auth.uid() = user_id);

-- fata_qualifications: users can read their own qualifications
DROP POLICY IF EXISTS "Users can read own fata qualifications" ON public.fata_qualifications;
CREATE POLICY "Users can read own fata qualifications"
  ON public.fata_qualifications
  FOR SELECT
  USING (auth.uid() = user_id);

-- fata_challenges_config: public read active challenges
DROP POLICY IF EXISTS "Public read active fata challenges" ON public.fata_challenges_config;
CREATE POLICY "Public read active fata challenges"
  ON public.fata_challenges_config
  FOR SELECT
  USING (is_active = true);
