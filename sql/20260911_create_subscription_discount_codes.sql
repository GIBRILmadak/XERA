-- XERA1: Create subscription_discount_codes table
-- This migration creates the table for storing classic discount codes.

CREATE TABLE IF NOT EXISTS public.subscription_discount_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  plan TEXT NOT NULL, -- 'standard', 'medium', 'pro', 'elite', 'page_verification'
  discount_percent NUMERIC(5,2) NOT NULL CHECK (discount_percent > 0 AND discount_percent <= 100),
  valid_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  valid_until TIMESTAMPTZ,
  benefit_duration_days INTEGER, -- Optional for discounts < 100%
  max_uses INTEGER,
  uses_count INTEGER DEFAULT 0,
  active BOOLEAN DEFAULT TRUE,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Row Level Security
ALTER TABLE public.subscription_discount_codes ENABLE ROW LEVEL SECURITY;

-- Policy for Super Admin (Hardcoded UUID based on current project standards)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'subscription_discount_codes' AND policyname = 'Super Admins can do everything'
    ) THEN
        CREATE POLICY "Super Admins can do everything" ON public.subscription_discount_codes
          FOR ALL USING (auth.uid() = 'b0f9f893-1706-4721-899c-d26ad79afc86');
    END IF;
END
$$;
