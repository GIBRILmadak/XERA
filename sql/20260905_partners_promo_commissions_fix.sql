-- Migration: partners, promo codes, referral attribution and commissions
-- Safe for existing schemas: adds missing columns instead of assuming a blank table.

CREATE TABLE IF NOT EXISTS public.partners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name TEXT,
  partner_access_code TEXT,
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  status TEXT DEFAULT 'active',
  commission_rate NUMERIC(5,4) DEFAULT 0.05,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.partners
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS partner_access_code TEXT,
  ADD COLUMN IF NOT EXISTS start_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS end_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS commission_rate NUMERIC(5,4) DEFAULT 0.05,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

UPDATE public.partners
SET start_date = COALESCE(start_date, NOW())
WHERE start_date IS NULL;

UPDATE public.partners
SET status = 'active'
WHERE status IS NULL OR btrim(status) = '';

UPDATE public.partners
SET commission_rate = 0.05
WHERE commission_rate IS NULL;

UPDATE public.partners
SET created_at = COALESCE(created_at, NOW())
WHERE created_at IS NULL;

UPDATE public.partners
SET updated_at = COALESCE(updated_at, NOW())
WHERE updated_at IS NULL;

ALTER TABLE public.partners
  ALTER COLUMN start_date SET DEFAULT NOW(),
  ALTER COLUMN status SET DEFAULT 'active',
  ALTER COLUMN commission_rate SET DEFAULT 0.05,
  ALTER COLUMN created_at SET DEFAULT NOW(),
  ALTER COLUMN updated_at SET DEFAULT NOW();

UPDATE public.partners
SET partner_access_code = 'PART-' || upper(substr(md5(random()::text), 1, 12))
WHERE partner_access_code IS NULL OR btrim(partner_access_code) = '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_partners_partner_access_code_unique
  ON public.partners (partner_access_code)
  WHERE partner_access_code IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.promo_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  discount_percentage NUMERIC(5,2) NOT NULL DEFAULT 20 CHECK (discount_percentage >= 0 AND discount_percentage <= 100),
  applicable_plan TEXT NOT NULL DEFAULT 'PRO',
  partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  valid_until TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.promo_codes
  ADD COLUMN IF NOT EXISTS code TEXT,
  ADD COLUMN IF NOT EXISTS discount_percentage NUMERIC(5,2) DEFAULT 20,
  ADD COLUMN IF NOT EXISTS applicable_plan TEXT DEFAULT 'PRO',
  ADD COLUMN IF NOT EXISTS partner_id UUID REFERENCES public.partners(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS valid_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

UPDATE public.promo_codes
SET discount_percentage = 20
WHERE discount_percentage IS NULL;

UPDATE public.promo_codes
SET applicable_plan = 'PRO'
WHERE applicable_plan IS NULL OR btrim(applicable_plan) = '';

UPDATE public.promo_codes
SET is_active = TRUE
WHERE is_active IS NULL;

CREATE TABLE IF NOT EXISTS public.commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  source_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  donation_id UUID,
  amount_earned NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.commissions
  ADD COLUMN IF NOT EXISTS partner_id UUID REFERENCES public.partners(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS source_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS donation_id UUID,
  ADD COLUMN IF NOT EXISTS amount_earned NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS referred_by_partner_id UUID REFERENCES public.partners(id);

ALTER TABLE public.user_subscriptions
  ADD COLUMN IF NOT EXISTS referred_by_partner_id UUID REFERENCES public.partners(id);

CREATE OR REPLACE FUNCTION public.set_partner_access_code()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.partner_access_code IS NULL OR btrim(NEW.partner_access_code) = '' THEN
    NEW.partner_access_code := 'PART-' || upper(substr(md5(random()::text), 1, 12));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_partner_access_code ON public.partners;
CREATE TRIGGER trg_set_partner_access_code
BEFORE INSERT OR UPDATE OF partner_access_code ON public.partners
FOR EACH ROW
EXECUTE FUNCTION public.set_partner_access_code();

CREATE INDEX IF NOT EXISTS idx_partners_status_dates
  ON public.partners (status, start_date, end_date);

CREATE INDEX IF NOT EXISTS idx_promo_codes_code_active
  ON public.promo_codes (code, is_active, valid_until);

CREATE INDEX IF NOT EXISTS idx_partners_user_id
  ON public.partners (user_id);

CREATE INDEX IF NOT EXISTS idx_commissions_partner_created
  ON public.commissions (partner_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_users_referred_partner
  ON public.users (referred_by_partner_id);

CREATE INDEX IF NOT EXISTS idx_user_subscriptions_referred_partner
  ON public.user_subscriptions (referred_by_partner_id);
