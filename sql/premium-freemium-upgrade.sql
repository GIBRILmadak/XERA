-- ==============================================================
-- XERA PREMIUM / FREEMIUM UPGRADE
-- ==============================================================
-- Idempotent schema update for role-based subscription handling.

ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'normal' CHECK (role IN ('normal', 'pro', 'admin'));

ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS is_pro BOOLEAN DEFAULT false;

ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS subscription_tier TEXT DEFAULT 'normal' CHECK (subscription_tier IN ('normal', 'pro'));

ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'inactive' CHECK (subscription_status IN ('inactive', 'active', 'trialing', 'canceled', 'past_due', 'suspended'));

ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS subscription_ends_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_users_role ON public.users(role);
CREATE INDEX IF NOT EXISTS idx_users_is_pro ON public.users(is_pro);
CREATE INDEX IF NOT EXISTS idx_users_subscription_tier ON public.users(subscription_tier);
CREATE INDEX IF NOT EXISTS idx_users_subscription_status ON public.users(subscription_status);

CREATE TABLE IF NOT EXISTS public.user_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    tier TEXT NOT NULL DEFAULT 'pro' CHECK (tier IN ('normal', 'pro')),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'canceled', 'trialing', 'past_due')),
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ends_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user_id ON public.user_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_status ON public.user_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_tier ON public.user_subscriptions(tier);

CREATE OR REPLACE FUNCTION public.sync_user_subscription_flags()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.role = 'pro' OR NEW.subscription_tier = 'pro' OR NEW.is_pro = true THEN
        NEW.is_pro := true;
        NEW.role := COALESCE(NEW.role, 'pro');
        NEW.subscription_tier := COALESCE(NEW.subscription_tier, 'pro');
    ELSE
        NEW.is_pro := false;
        NEW.role := COALESCE(NEW.role, 'normal');
        NEW.subscription_tier := COALESCE(NEW.subscription_tier, 'normal');
    END IF;

    IF NEW.subscription_status IS NULL OR NEW.subscription_status = '' THEN
        NEW.subscription_status := 'inactive';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_user_subscription_flags ON public.users;
CREATE TRIGGER trg_sync_user_subscription_flags
    BEFORE INSERT OR UPDATE ON public.users
    FOR EACH ROW
    EXECUTE FUNCTION public.sync_user_subscription_flags();

UPDATE public.users
SET role = COALESCE(role, 'normal'),
    is_pro = COALESCE(is_pro, false),
    subscription_tier = COALESCE(subscription_tier, CASE WHEN COALESCE(is_pro, false) THEN 'pro' ELSE 'normal' END),
    subscription_status = COALESCE(subscription_status, 'inactive')
WHERE id IS NOT NULL;
