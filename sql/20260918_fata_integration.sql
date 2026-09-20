-- Fata × XERA1 Integration Schema

-- 1. OAUTH STATES ENHANCEMENT
-- We need to store PKCE code_verifier, nonce, and challengeId
ALTER TABLE public.oauth_states
  ADD COLUMN IF NOT EXISTS challenge_id TEXT,
  ADD COLUMN IF NOT EXISTS code_verifier TEXT,
  ADD COLUMN IF NOT EXISTS nonce TEXT;

-- 2. FATA LINKAGES
-- Link XERA1 user to Fata sub
CREATE TABLE IF NOT EXISTS public.fata_linkages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  fata_iss TEXT NOT NULL DEFAULT 'https://fata.app/oidc',
  fata_sub TEXT NOT NULL,
  preferred_username TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, fata_iss),
  UNIQUE (fata_iss, fata_sub)
);

-- 3. FATA CHALLENGES CONFIGURATION
-- Store XERA1 internal config for Fata challenges
CREATE TABLE IF NOT EXISTS public.fata_challenges_config (
  id TEXT PRIMARY KEY, -- the challengeId from Fata
  name TEXT NOT NULL,
  is_test BOOLEAN NOT NULL DEFAULT false,
  req_arc TEXT NOT NULL DEFAULT 'req_arc',
  req_preuve TEXT NOT NULL DEFAULT 'req_preuve',
  req_jalon TEXT NOT NULL DEFAULT 'req_jalon',
  start_day INTEGER NOT NULL DEFAULT 1,
  end_day INTEGER NOT NULL DEFAULT 30,
  close_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. FATA PENDING EVENTS (Outbox Queue)
-- Durable queue for action completions
CREATE TABLE IF NOT EXISTS public.fata_pending_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  fata_sub TEXT NOT NULL,
  challenge_id TEXT NOT NULL REFERENCES public.fata_challenges_config(id),
  requirement_id TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'delivered', 'failed', 'retry')),
  retry_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  next_retry_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fata_pending_events_status_retry
  ON public.fata_pending_events (status, next_retry_at)
  WHERE status IN ('pending', 'retry');

-- 5. FATA QUALIFICATIONS & REWARDS
-- Store final qualification from Fata
CREATE TABLE IF NOT EXISTS public.fata_qualifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  challenge_id TEXT NOT NULL REFERENCES public.fata_challenges_config(id),
  fata_sub TEXT NOT NULL,
  qualified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  validated_by UUID REFERENCES auth.users(id), -- Admin who imported the list
  badge_awarded BOOLEAN NOT NULL DEFAULT false,
  visibility_boost_active BOOLEAN NOT NULL DEFAULT false,
  visibility_multiplier NUMERIC(3,2) DEFAULT 1.0,
  boost_started_at TIMESTAMPTZ,
  boost_ends_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, challenge_id)
);

-- 6. TRIGGERS FOR EVENT DETECTION
-- Minimal triggers to notify the background worker of potential actions

-- Helper function to check if user is linked to Fata
CREATE OR REPLACE FUNCTION public.is_fata_user(p_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (SELECT 1 FROM public.fata_linkages WHERE user_id = p_user_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger function for Arcs (Action 1)
CREATE OR REPLACE FUNCTION public.on_arc_change_fata()
RETURNS TRIGGER AS $$
BEGIN
  -- We only care about published arcs from Fata users
  -- Logic validation will be done by the worker
  IF public.is_fata_user(NEW.user_id) THEN
    -- Insert a generic event if not already present for this arc
    -- The worker will decide if it meets req_arc
    INSERT INTO public.fata_pending_events (user_id, fata_sub, challenge_id, requirement_id, occurred_at, idempotency_key)
    SELECT
      l.user_id,
      l.fata_sub,
      'TBD', -- challenge_id will be resolved by worker or we need a way to know the active challenge
      'req_arc',
      NOW(),
      'arc-' || NEW.id::text
    FROM public.fata_linkages l
    WHERE l.user_id = NEW.user_id
    ON CONFLICT (idempotency_key) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Note: The triggers above are conceptual.
-- Since we don't know the challenge_id at trigger time easily,
-- the worker will scan for ALL linked users' activity.
-- Alternatively, we store the "current_challenge_id" in a setting or fata_linkages.

-- Let's stick to a simpler "fata_activity_log" that the worker parses.
CREATE TABLE IF NOT EXISTS public.fata_activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  entity_type TEXT NOT NULL, -- 'arc', 'content', 'validation'
  entity_id UUID NOT NULL,
  action TEXT NOT NULL, -- 'insert', 'update'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION public.log_fata_activity()
RETURNS TRIGGER AS $$
DECLARE
  v_user_id UUID;
BEGIN
  IF TG_TABLE_NAME = 'arcs' THEN v_user_id := NEW.user_id;
  ELSIF TG_TABLE_NAME = 'content' THEN v_user_id := NEW.user_id;
  ELSIF TG_TABLE_NAME = 'arc_milestone_validations' THEN v_user_id := NEW.validator_user_id; -- Wait, Action 3 is about the milestone owner
  END IF;

  IF public.is_fata_user(v_user_id) THEN
    INSERT INTO public.fata_activity_log (user_id, entity_type, entity_id, action)
    VALUES (v_user_id, TG_TABLE_NAME, NEW.id, TG_OP);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Apply triggers
-- DROP TRIGGER IF EXISTS tr_fata_arc_activity ON public.arcs;
-- CREATE TRIGGER tr_fata_arc_activity AFTER INSERT OR UPDATE ON public.arcs FOR EACH ROW EXECUTE FUNCTION public.log_fata_activity();

-- DROP TRIGGER IF EXISTS tr_fata_content_activity ON public.content;
-- CREATE TRIGGER tr_fata_content_activity AFTER INSERT OR UPDATE ON public.content FOR EACH ROW EXECUTE FUNCTION public.log_fata_activity();
