-- Fata × XERA1 Integration Schema - FINAL REFINED VERSION

-- 1. OAUTH STATES ENHANCEMENT
-- We need to store PKCE code_verifier, nonce, and challenge_id
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
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, fata_iss),
  UNIQUE (fata_iss, fata_sub)
);

-- 3. FATA CHALLENGES CONFIGURATION
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

CREATE TABLE IF NOT EXISTS public.fata_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID,
  type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'medium',
  message TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (event_id)
);

CREATE INDEX IF NOT EXISTS idx_fata_alerts_type_created_at
  ON public.fata_alerts (type, created_at DESC);

-- 6. ACTIVITY LOG FOR WORKER
CREATE TABLE IF NOT EXISTS public.fata_activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  entity_type TEXT NOT NULL, -- 'arcs', 'content', 'arc_milestone_validations'
  entity_id UUID NOT NULL,
  action TEXT NOT NULL, -- 'INSERT', 'UPDATE'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fata_activity_log_user_id ON public.fata_activity_log (user_id);
CREATE INDEX IF NOT EXISTS idx_fata_activity_log_created_at ON public.fata_activity_log (created_at);

-- 7. TRIGGERS
CREATE OR REPLACE FUNCTION public.is_fata_user(p_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (SELECT 1 FROM public.fata_linkages WHERE user_id = p_user_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.log_fata_activity()
RETURNS TRIGGER AS $$
DECLARE
  v_user_id UUID;
BEGIN
  IF TG_TABLE_NAME = 'arcs' THEN
    v_user_id := NEW.user_id;
  ELSIF TG_TABLE_NAME = 'content' THEN
    v_user_id := NEW.user_id;
  ELSIF TG_TABLE_NAME = 'arc_milestone_validations' THEN
    -- For validations, we care about the owner of the content being validated
    SELECT user_id INTO v_user_id FROM public.content WHERE id = NEW.content_id;
  END IF;

  IF v_user_id IS NOT NULL AND public.is_fata_user(v_user_id) THEN
    INSERT INTO public.fata_activity_log (user_id, entity_type, entity_id, action)
    VALUES (v_user_id, TG_TABLE_NAME, NEW.id, TG_OP);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Arcs Trigger
DROP TRIGGER IF EXISTS tr_fata_arc_activity ON public.arcs;
CREATE TRIGGER tr_fata_arc_activity
AFTER INSERT OR UPDATE ON public.arcs
FOR EACH ROW EXECUTE FUNCTION public.log_fata_activity();

-- Content Trigger
DROP TRIGGER IF EXISTS tr_fata_content_activity ON public.content;
CREATE TRIGGER tr_fata_content_activity
AFTER INSERT OR UPDATE ON public.content
FOR EACH ROW EXECUTE FUNCTION public.log_fata_activity();

-- Validations Trigger
DROP TRIGGER IF EXISTS tr_fata_validation_activity ON public.arc_milestone_validations;
CREATE TRIGGER tr_fata_validation_activity
AFTER INSERT OR UPDATE ON public.arc_milestone_validations
FOR EACH ROW EXECUTE FUNCTION public.log_fata_activity();
