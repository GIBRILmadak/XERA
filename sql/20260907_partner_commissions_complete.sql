-- XERA1: complete partner commissions schema
-- Run in Supabase SQL editor after the existing migrations.
-- This migration keeps compatibility with the current API while exposing
-- the requested partner/referral/commission model.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.partners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  partner_access_code TEXT,
  start_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  end_date TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'active',
  commission_rate NUMERIC(5,4) NOT NULL DEFAULT 0.05,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.partners
  ADD COLUMN IF NOT EXISTS access_code TEXT,
  ADD COLUMN IF NOT EXISTS discount_code TEXT,
  ADD COLUMN IF NOT EXISTS discount_rate NUMERIC(5,2) DEFAULT 20,
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

UPDATE public.partners
SET access_code = COALESCE(NULLIF(btrim(access_code), ''), partner_access_code, 'PART-' || upper(substr(md5(random()::text), 1, 12))),
    discount_rate = COALESCE(discount_rate, 20),
    expires_at = COALESCE(expires_at, end_date)
WHERE access_code IS NULL OR btrim(access_code) = '' OR discount_rate IS NULL OR expires_at IS NULL;

UPDATE public.partners
SET discount_code = COALESCE(NULLIF(btrim(discount_code), ''), 'XERA-' || upper(substr(md5(random()::text), 1, 10)))
WHERE discount_code IS NULL OR btrim(discount_code) = '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_partners_access_code_unique
  ON public.partners (access_code)
  WHERE access_code IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_partners_discount_code_unique
  ON public.partners (discount_code)
  WHERE discount_code IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.partner_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'expired')),
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.partner_discount_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  discount_percent NUMERIC(5,2) NOT NULL DEFAULT 20,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'expired')),
  starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.partner_referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subscribed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (partner_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.partner_affiliations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  partner_discount_code_id UUID REFERENCES public.partner_discount_codes(id) ON DELETE SET NULL,
  subscription_id UUID,
  status TEXT NOT NULL DEFAULT 'active',
  eligible_from TIMESTAMPTZ,
  eligible_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, subscription_id)
);

CREATE TABLE IF NOT EXISTS public.partner_page_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_page_id UUID NOT NULL REFERENCES public.professional_pages(id) ON DELETE CASCADE,
  partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  partner_code_id UUID REFERENCES public.partner_codes(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active',
  activated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deactivated_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (professional_page_id)
);

CREATE TABLE IF NOT EXISTS public.partner_commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  donation_id UUID,
  support_transaction_id UUID,
  beneficiary_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  source_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  donation_amount NUMERIC(12,2),
  amount_gross NUMERIC(12,2) NOT NULL DEFAULT 0,
  commission_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  beneficiary_net_amount NUMERIC(12,2) DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'available',
  available_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (partner_id, donation_id)
);

CREATE TABLE IF NOT EXISTS public.partner_payout_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL UNIQUE REFERENCES public.partners(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  account_name TEXT NOT NULL,
  wallet_number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.partner_payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  amount_usd NUMERIC(12,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'processing',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.partner_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.partner_commissions
  ADD COLUMN IF NOT EXISTS donation_amount NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS amount_gross NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS support_transaction_id UUID,
  ADD COLUMN IF NOT EXISTS beneficiary_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'available',
  ADD COLUMN IF NOT EXISTS available_at TIMESTAMPTZ;

UPDATE public.partner_commissions
SET amount_gross = COALESCE(amount_gross, donation_amount, 0),
    donation_amount = COALESCE(donation_amount, amount_gross, 0),
    status = COALESCE(NULLIF(status, ''), 'available')
WHERE amount_gross IS NULL OR donation_amount IS NULL OR status IS NULL OR btrim(status) = '';

CREATE INDEX IF NOT EXISTS idx_partner_codes_partner_status
  ON public.partner_codes (partner_id, status, expires_at);
CREATE INDEX IF NOT EXISTS idx_partner_referrals_partner
  ON public.partner_referrals (partner_id, subscribed_at DESC);
CREATE INDEX IF NOT EXISTS idx_partner_affiliations_partner
  ON public.partner_affiliations (partner_id, status);
CREATE INDEX IF NOT EXISTS idx_partner_memberships_partner
  ON public.partner_page_memberships (partner_id, status);
CREATE INDEX IF NOT EXISTS idx_partner_commissions_partner_created
  ON public.partner_commissions (partner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_partner_payouts_partner_status
  ON public.partner_payouts (partner_id, status);

-- Seed the API-managed code tables from the compact partner columns when needed.
INSERT INTO public.partner_codes (partner_id, code, expires_at)
SELECT id, access_code, expires_at
FROM public.partners
WHERE access_code IS NOT NULL
  AND btrim(access_code) <> ''
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.partner_discount_codes (partner_id, code, discount_percent, expires_at)
SELECT id, discount_code, COALESCE(discount_rate, 20), expires_at
FROM public.partners
WHERE discount_code IS NOT NULL
  AND btrim(discount_code) <> ''
ON CONFLICT (code) DO NOTHING;
