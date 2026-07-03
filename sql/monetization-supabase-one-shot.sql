-- ========================================
-- XERA MONETIZATION - FULL SUPABASE BOOTSTRAP
-- A coller une seule fois dans Supabase SQL Editor
-- ========================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
    IF to_regclass('public.users') IS NULL THEN
        RAISE EXCEPTION 'Table public.users manquante. Initialise d''abord la base principale XERA.';
    END IF;

    IF to_regclass('public.content') IS NULL THEN
        RAISE EXCEPTION 'Table public.content manquante. La monetisation video a besoin de cette table.';
    END IF;
END $$;

-- ========================================
-- USERS MONETIZATION COLUMNS
-- ========================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'users'
          AND column_name = 'plan'
    ) THEN
        EXECUTE 'ALTER TABLE public.users ADD COLUMN plan TEXT';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'users'
          AND column_name = 'plan_status'
    ) THEN
        EXECUTE 'ALTER TABLE public.users ADD COLUMN plan_status TEXT';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'users'
          AND column_name = 'plan_ends_at'
    ) THEN
        EXECUTE 'ALTER TABLE public.users ADD COLUMN plan_ends_at TIMESTAMP WITH TIME ZONE';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'users'
          AND column_name = 'is_monetized'
    ) THEN
        EXECUTE 'ALTER TABLE public.users ADD COLUMN is_monetized BOOLEAN';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'users'
          AND column_name = 'followers_count'
    ) THEN
        EXECUTE 'ALTER TABLE public.users ADD COLUMN followers_count INTEGER';
    END IF;

    EXECUTE 'ALTER TABLE public.users ALTER COLUMN plan SET DEFAULT ''free''';
    EXECUTE 'ALTER TABLE public.users ALTER COLUMN plan_status SET DEFAULT ''inactive''';
    EXECUTE 'ALTER TABLE public.users ALTER COLUMN is_monetized SET DEFAULT false';
    EXECUTE 'ALTER TABLE public.users ALTER COLUMN followers_count SET DEFAULT 0';

    EXECUTE $sql$
        UPDATE public.users
        SET
            plan = COALESCE(plan, 'free'),
            plan_status = COALESCE(plan_status, 'inactive'),
            is_monetized = COALESCE(is_monetized, false),
            followers_count = COALESCE(followers_count, 0)
        WHERE plan IS NULL
           OR plan_status IS NULL
           OR is_monetized IS NULL
           OR followers_count IS NULL
    $sql$;

    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_users_plan ON public.users(plan)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_users_plan_status ON public.users(plan_status)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_users_is_monetized ON public.users(is_monetized)';
END $$;

-- ========================================
-- SUBSCRIPTIONS
-- ========================================

CREATE TABLE IF NOT EXISTS subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan TEXT NOT NULL CHECK (plan IN ('standard', 'medium', 'pro')),
    status TEXT NOT NULL CHECK (status IN ('active', 'canceled', 'past_due', 'incomplete', 'incomplete_expired')),
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    current_period_start TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    current_period_end TIMESTAMP WITH TIME ZONE,
    cancel_at_period_end BOOLEAN DEFAULT false,
    canceled_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE subscriptions
    ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS plan TEXT,
    ADD COLUMN IF NOT EXISTS status TEXT,
    ADD COLUMN IF NOT EXISTS started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS current_period_start TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS cancel_at_period_end BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS canceled_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_plan ON subscriptions(plan);

DROP TRIGGER IF EXISTS update_subscriptions_updated_at ON subscriptions;
CREATE TRIGGER update_subscriptions_updated_at
    BEFORE UPDATE ON subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ========================================
-- TRANSACTIONS
-- ========================================

CREATE TABLE IF NOT EXISTS transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    from_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    to_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('support', 'video_rpm', 'subscription', 'other')),
    amount_gross DECIMAL(10, 2) NOT NULL DEFAULT 0,
    amount_net_creator DECIMAL(10, 2) NOT NULL DEFAULT 0,
    amount_commission_xera DECIMAL(10, 2) NOT NULL DEFAULT 0,
    currency TEXT DEFAULT 'USD',
    status TEXT NOT NULL CHECK (status IN ('pending', 'succeeded', 'failed', 'refunded', 'canceled')),
    description TEXT,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE transactions
    ADD COLUMN IF NOT EXISTS from_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS to_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS type TEXT,
    ADD COLUMN IF NOT EXISTS amount_gross DECIMAL(10, 2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS amount_net_creator DECIMAL(10, 2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS amount_commission_xera DECIMAL(10, 2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'USD',
    ADD COLUMN IF NOT EXISTS status TEXT,
    ADD COLUMN IF NOT EXISTS description TEXT,
    ADD COLUMN IF NOT EXISTS metadata JSONB,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_transactions_from_user ON transactions(from_user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_to_user ON transactions(to_user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_transactions_date_type
    ON transactions(created_at, type)
    WHERE status = 'succeeded';

DROP TRIGGER IF EXISTS update_transactions_updated_at ON transactions;
CREATE TRIGGER update_transactions_updated_at
    BEFORE UPDATE ON transactions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ========================================
-- VIDEO VIEWS
-- ========================================

CREATE TABLE IF NOT EXISTS video_views (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    video_id UUID NOT NULL REFERENCES content(id) ON DELETE CASCADE,
    creator_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    view_count BIGINT DEFAULT 0,
    eligible BOOLEAN DEFAULT false,
    video_duration INTEGER,
    period_date DATE DEFAULT CURRENT_DATE,
    period_month DATE DEFAULT DATE_TRUNC('month', CURRENT_DATE),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(video_id, period_date)
);

ALTER TABLE video_views
    ADD COLUMN IF NOT EXISTS video_id UUID REFERENCES content(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS creator_id UUID REFERENCES users(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS view_count BIGINT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS eligible BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS video_duration INTEGER,
    ADD COLUMN IF NOT EXISTS period_date DATE DEFAULT CURRENT_DATE,
    ADD COLUMN IF NOT EXISTS period_month DATE DEFAULT DATE_TRUNC('month', CURRENT_DATE),
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS idx_video_views_video_id_period_date
    ON video_views(video_id, period_date);

CREATE INDEX IF NOT EXISTS idx_video_views_video_id ON video_views(video_id);
CREATE INDEX IF NOT EXISTS idx_video_views_creator_id ON video_views(creator_id);
CREATE INDEX IF NOT EXISTS idx_video_views_eligible ON video_views(eligible);
CREATE INDEX IF NOT EXISTS idx_video_views_period_date ON video_views(period_date);
CREATE INDEX IF NOT EXISTS idx_video_views_period_month ON video_views(period_month);
CREATE INDEX IF NOT EXISTS idx_video_views_aggregation
    ON video_views(creator_id, period_month, eligible)
    WHERE eligible = true;

DROP TRIGGER IF EXISTS update_video_views_updated_at ON video_views;
CREATE TRIGGER update_video_views_updated_at
    BEFORE UPDATE ON video_views
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE FUNCTION sync_video_view_eligibility()
RETURNS TRIGGER AS $$
BEGIN
    NEW.period_date = COALESCE(NEW.period_date, CURRENT_DATE);
    NEW.period_month = DATE_TRUNC('month', NEW.period_date)::DATE;
    NEW.eligible = COALESCE(NEW.video_duration, 0) > 60;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_sync_video_view_eligibility ON video_views;
CREATE TRIGGER trigger_sync_video_view_eligibility
    BEFORE INSERT OR UPDATE ON video_views
    FOR EACH ROW
    EXECUTE FUNCTION sync_video_view_eligibility();

-- ========================================
-- VIDEO PAYOUTS
-- ========================================

CREATE TABLE IF NOT EXISTS video_payouts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    creator_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    period_month DATE NOT NULL,
    views BIGINT DEFAULT 0,
    rpm_rate DECIMAL(10, 4) DEFAULT 0.40,
    amount_gross DECIMAL(10, 2) NOT NULL DEFAULT 0,
    amount_net_creator DECIMAL(10, 2) NOT NULL DEFAULT 0,
    amount_commission_xera DECIMAL(10, 2) NOT NULL DEFAULT 0,
    status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'paid', 'failed')),
    paid_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(creator_id, period_month)
);

ALTER TABLE video_payouts
    ADD COLUMN IF NOT EXISTS creator_id UUID REFERENCES users(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS period_month DATE,
    ADD COLUMN IF NOT EXISTS views BIGINT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS rpm_rate DECIMAL(10, 4) DEFAULT 0.40,
    ADD COLUMN IF NOT EXISTS amount_gross DECIMAL(10, 2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS amount_net_creator DECIMAL(10, 2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS amount_commission_xera DECIMAL(10, 2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS status TEXT,
    ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS idx_video_payouts_creator_period
    ON video_payouts(creator_id, period_month);

CREATE INDEX IF NOT EXISTS idx_video_payouts_creator_id ON video_payouts(creator_id);
CREATE INDEX IF NOT EXISTS idx_video_payouts_status ON video_payouts(status);
CREATE INDEX IF NOT EXISTS idx_video_payouts_period_month ON video_payouts(period_month);

DROP TRIGGER IF EXISTS update_video_payouts_updated_at ON video_payouts;
CREATE TRIGGER update_video_payouts_updated_at
    BEFORE UPDATE ON video_payouts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ========================================
-- AUDIT LOGS
-- ========================================

CREATE TABLE IF NOT EXISTS monetization_audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id UUID,
    old_values JSONB,
    new_values JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE monetization_audit_logs
    ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS action TEXT,
    ADD COLUMN IF NOT EXISTS entity_type TEXT,
    ADD COLUMN IF NOT EXISTS entity_id UUID,
    ADD COLUMN IF NOT EXISTS old_values JSONB,
    ADD COLUMN IF NOT EXISTS new_values JSONB,
    ADD COLUMN IF NOT EXISTS ip_address INET,
    ADD COLUMN IF NOT EXISTS user_agent TEXT,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON monetization_audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON monetization_audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON monetization_audit_logs(created_at);

-- ========================================
-- PORTEFEUILLE / RETRAITS
-- ========================================

CREATE TABLE IF NOT EXISTS creator_payout_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    channel TEXT NOT NULL DEFAULT 'mobile_money',
    provider TEXT NOT NULL DEFAULT 'airtel_money',
    account_name TEXT NOT NULL DEFAULT '',
    wallet_number TEXT NOT NULL DEFAULT '',
    country_code TEXT DEFAULT 'CD',
    status TEXT NOT NULL DEFAULT 'active',
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE creator_payout_settings
    ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'mobile_money',
    ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'airtel_money',
    ADD COLUMN IF NOT EXISTS account_name TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS wallet_number TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS country_code TEXT DEFAULT 'CD',
    ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active',
    ADD COLUMN IF NOT EXISTS notes TEXT,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS idx_creator_payout_settings_user_id
    ON creator_payout_settings(user_id);

DROP TRIGGER IF EXISTS update_creator_payout_settings_updated_at
    ON creator_payout_settings;
CREATE TRIGGER update_creator_payout_settings_updated_at
    BEFORE UPDATE ON creator_payout_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS withdrawal_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    creator_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    payout_setting_id UUID REFERENCES creator_payout_settings(id) ON DELETE SET NULL,
    amount_usd DECIMAL(10, 2) NOT NULL DEFAULT 0,
    requested_amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
    requested_currency TEXT NOT NULL DEFAULT 'USD',
    channel TEXT NOT NULL DEFAULT 'mobile_money',
    provider TEXT NOT NULL DEFAULT 'airtel_money',
    wallet_number TEXT NOT NULL DEFAULT '',
    account_name TEXT NOT NULL DEFAULT '',
    note TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    operator_ref_id TEXT,
    admin_note TEXT,
    requested_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    processed_at TIMESTAMP WITH TIME ZONE,
    paid_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE withdrawal_requests
    ADD COLUMN IF NOT EXISTS creator_id UUID REFERENCES users(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS payout_setting_id UUID REFERENCES creator_payout_settings(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS amount_usd DECIMAL(10, 2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS requested_amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS requested_currency TEXT NOT NULL DEFAULT 'USD',
    ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'mobile_money',
    ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'airtel_money',
    ADD COLUMN IF NOT EXISTS wallet_number TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS account_name TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS note TEXT,
    ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending',
    ADD COLUMN IF NOT EXISTS operator_ref_id TEXT,
    ADD COLUMN IF NOT EXISTS admin_note TEXT,
    ADD COLUMN IF NOT EXISTS requested_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS processed_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_creator_id
    ON withdrawal_requests(creator_id);
CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_status
    ON withdrawal_requests(status);
CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_created_at
    ON withdrawal_requests(created_at DESC);

DROP TRIGGER IF EXISTS update_withdrawal_requests_updated_at
    ON withdrawal_requests;
CREATE TRIGGER update_withdrawal_requests_updated_at
    BEFORE UPDATE ON withdrawal_requests
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'creator_payout_settings_channel_check'
    ) THEN
        ALTER TABLE creator_payout_settings
            ADD CONSTRAINT creator_payout_settings_channel_check
            CHECK (channel IN ('mobile_money'));
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'creator_payout_settings_provider_check'
    ) THEN
        ALTER TABLE creator_payout_settings
            ADD CONSTRAINT creator_payout_settings_provider_check
            CHECK (provider IN ('airtel_money', 'orange_money', 'mpesa', 'afrimoney', 'other'));
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'creator_payout_settings_status_check'
    ) THEN
        ALTER TABLE creator_payout_settings
            ADD CONSTRAINT creator_payout_settings_status_check
            CHECK (status IN ('active', 'inactive'));
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'withdrawal_requests_amount_usd_check'
    ) THEN
        ALTER TABLE withdrawal_requests
            ADD CONSTRAINT withdrawal_requests_amount_usd_check
            CHECK (amount_usd > 0);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'withdrawal_requests_requested_amount_check'
    ) THEN
        ALTER TABLE withdrawal_requests
            ADD CONSTRAINT withdrawal_requests_requested_amount_check
            CHECK (requested_amount > 0);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'withdrawal_requests_channel_check'
    ) THEN
        ALTER TABLE withdrawal_requests
            ADD CONSTRAINT withdrawal_requests_channel_check
            CHECK (channel IN ('mobile_money'));
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'withdrawal_requests_provider_check'
    ) THEN
        ALTER TABLE withdrawal_requests
            ADD CONSTRAINT withdrawal_requests_provider_check
            CHECK (provider IN ('airtel_money', 'orange_money', 'mpesa', 'afrimoney', 'other'));
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'withdrawal_requests_status_check'
    ) THEN
        ALTER TABLE withdrawal_requests
            ADD CONSTRAINT withdrawal_requests_status_check
            CHECK (status IN ('pending', 'processing', 'paid', 'rejected', 'canceled'));
    END IF;
END $$;

-- ========================================
-- CORE FUNCTIONS
-- ========================================

CREATE OR REPLACE FUNCTION calculate_monetization_status()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.plan = 'pro' AND NEW.plan_status = 'active' AND NEW.plan_ends_at IS NULL THEN
        NEW.is_monetized = true;
    ELSIF NEW.plan IN ('medium', 'pro')
       AND NEW.plan_status = 'active'
       AND COALESCE(NEW.followers_count, 0) >= 1000 THEN
        NEW.is_monetized = true;
    ELSE
        NEW.is_monetized = false;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_calculate_monetization ON users;
CREATE TRIGGER trigger_calculate_monetization
    BEFORE INSERT OR UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION calculate_monetization_status();

CREATE OR REPLACE FUNCTION calculate_transaction_amounts()
RETURNS TRIGGER AS $$
BEGIN
    NEW.amount_commission_xera = COALESCE(NEW.amount_gross, 0) * 0.20;
    NEW.amount_net_creator = COALESCE(NEW.amount_gross, 0) * 0.80;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_calculate_transaction_amounts ON transactions;
CREATE TRIGGER trigger_calculate_transaction_amounts
    BEFORE INSERT OR UPDATE OF amount_gross ON transactions
    FOR EACH ROW
    EXECUTE FUNCTION calculate_transaction_amounts();

CREATE OR REPLACE FUNCTION calculate_video_payout_amounts()
RETURNS TRIGGER AS $$
BEGIN
    NEW.amount_gross = (COALESCE(NEW.views, 0) / 1000.0) * COALESCE(NEW.rpm_rate, 0.40);
    NEW.amount_commission_xera = COALESCE(NEW.amount_gross, 0) * 0.20;
    NEW.amount_net_creator = COALESCE(NEW.amount_gross, 0) * 0.80;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_calculate_payout_amounts ON video_payouts;
CREATE TRIGGER trigger_calculate_payout_amounts
    BEFORE INSERT OR UPDATE OF views, rpm_rate ON video_payouts
    FOR EACH ROW
    EXECUTE FUNCTION calculate_video_payout_amounts();

CREATE OR REPLACE FUNCTION create_monthly_video_payout(
    p_creator_id UUID,
    p_period_month DATE
)
RETURNS UUID AS $$
DECLARE
    v_total_views BIGINT;
    v_amount_gross DECIMAL;
    v_payout_id UUID;
BEGIN
    SELECT COALESCE(SUM(view_count), 0)
    INTO v_total_views
    FROM video_views
    WHERE creator_id = p_creator_id
        AND period_month = p_period_month
        AND eligible = true
        AND COALESCE(video_duration, 0) > 60;

    v_amount_gross := (v_total_views / 1000.0) * 0.40;

    INSERT INTO video_payouts (
        creator_id,
        period_month,
        views,
        rpm_rate,
        amount_gross,
        amount_net_creator,
        amount_commission_xera,
        status
    )
    VALUES (
        p_creator_id,
        p_period_month,
        v_total_views,
        0.40,
        v_amount_gross,
        v_amount_gross * 0.80,
        v_amount_gross * 0.20,
        'pending'
    )
    ON CONFLICT (creator_id, period_month)
    DO UPDATE SET
        views = EXCLUDED.views,
        amount_gross = EXCLUDED.amount_gross,
        amount_net_creator = EXCLUDED.amount_net_creator,
        amount_commission_xera = EXCLUDED.amount_commission_xera,
        updated_at = NOW()
    RETURNING id INTO v_payout_id;

    RETURN v_payout_id;
END;
$$ LANGUAGE plpgsql;

-- ========================================
-- RLS POLICIES
-- ========================================

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE monetization_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator_payout_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE withdrawal_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own subscriptions" ON subscriptions;
CREATE POLICY "Users can view own subscriptions" ON subscriptions
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Only system can insert subscriptions" ON subscriptions;
CREATE POLICY "Only system can insert subscriptions" ON subscriptions
    FOR INSERT WITH CHECK (false);

DROP POLICY IF EXISTS "Only system can update subscriptions" ON subscriptions;
CREATE POLICY "Only system can update subscriptions" ON subscriptions
    FOR UPDATE USING (false);

DROP POLICY IF EXISTS "Users can view transactions as sender" ON transactions;
CREATE POLICY "Users can view transactions as sender" ON transactions
    FOR SELECT USING (auth.uid() = from_user_id);

DROP POLICY IF EXISTS "Users can view transactions as receiver" ON transactions;
CREATE POLICY "Users can view transactions as receiver" ON transactions
    FOR SELECT USING (auth.uid() = to_user_id);

DROP POLICY IF EXISTS "Only system can insert transactions" ON transactions;
CREATE POLICY "Only system can insert transactions" ON transactions
    FOR INSERT WITH CHECK (false);

DROP POLICY IF EXISTS "Only system can update transactions" ON transactions;
CREATE POLICY "Only system can update transactions" ON transactions
    FOR UPDATE USING (false);

DROP POLICY IF EXISTS "Creators can view own video stats" ON video_views;
CREATE POLICY "Creators can view own video stats" ON video_views
    FOR SELECT USING (auth.uid() = creator_id);

DROP POLICY IF EXISTS "Only system can manage video views" ON video_views;
CREATE POLICY "Only system can manage video views" ON video_views
    FOR ALL USING (false);

DROP POLICY IF EXISTS "Creators can view own payouts" ON video_payouts;
CREATE POLICY "Creators can view own payouts" ON video_payouts
    FOR SELECT USING (auth.uid() = creator_id);

DROP POLICY IF EXISTS "Only system can manage payouts" ON video_payouts;
CREATE POLICY "Only system can manage payouts" ON video_payouts
    FOR ALL USING (false);

DROP POLICY IF EXISTS "Users can view own audit logs" ON monetization_audit_logs;
CREATE POLICY "Users can view own audit logs" ON monetization_audit_logs
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own audit logs" ON monetization_audit_logs;
CREATE POLICY "Users can insert own audit logs" ON monetization_audit_logs
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own payout settings" ON creator_payout_settings;
CREATE POLICY "Users can view own payout settings" ON creator_payout_settings
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage own payout settings" ON creator_payout_settings;
CREATE POLICY "Users can manage own payout settings" ON creator_payout_settings
    FOR ALL USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own withdrawal requests" ON withdrawal_requests;
CREATE POLICY "Users can view own withdrawal requests" ON withdrawal_requests
    FOR SELECT USING (auth.uid() = creator_id);

DROP POLICY IF EXISTS "Users can create own withdrawal requests" ON withdrawal_requests;
CREATE POLICY "Users can create own withdrawal requests" ON withdrawal_requests
    FOR INSERT WITH CHECK (auth.uid() = creator_id);

DROP POLICY IF EXISTS "Users can update own pending withdrawal requests" ON withdrawal_requests;
CREATE POLICY "Users can update own pending withdrawal requests" ON withdrawal_requests
    FOR UPDATE USING (
        auth.uid() = creator_id
        AND status IN ('pending')
    )
    WITH CHECK (
        auth.uid() = creator_id
        AND status IN ('pending', 'canceled')
    );

-- ========================================
-- DASHBOARD VIEWS
-- ========================================

CREATE OR REPLACE VIEW creator_revenue_summary AS
SELECT
    to_user_id AS creator_id,
    COUNT(*) AS total_transactions,
    SUM(amount_gross) AS total_gross_revenue,
    SUM(amount_net_creator) AS total_net_revenue,
    SUM(amount_commission_xera) AS total_xera_commission,
    SUM(CASE WHEN type = 'support' THEN amount_net_creator ELSE 0 END) AS support_revenue,
    SUM(CASE WHEN type = 'video_rpm' THEN amount_net_creator ELSE 0 END) AS video_revenue,
    MIN(created_at) AS first_transaction,
    MAX(created_at) AS last_transaction
FROM transactions
WHERE status = 'succeeded'
GROUP BY to_user_id;

CREATE OR REPLACE VIEW creator_monthly_stats AS
SELECT
    to_user_id AS creator_id,
    DATE_TRUNC('month', created_at) AS month,
    COUNT(*) AS transaction_count,
    SUM(amount_net_creator) AS monthly_revenue,
    SUM(CASE WHEN type = 'support' THEN 1 ELSE 0 END) AS support_count,
    SUM(CASE WHEN type = 'video_rpm' THEN 1 ELSE 0 END) AS video_payout_count
FROM transactions
WHERE status = 'succeeded'
GROUP BY to_user_id, DATE_TRUNC('month', created_at);

-- ========================================
-- RECONCILIATION DATA
-- ========================================

UPDATE video_views
SET
    period_date = COALESCE(period_date, CURRENT_DATE),
    period_month = DATE_TRUNC('month', COALESCE(period_date, CURRENT_DATE))::DATE,
    eligible = COALESCE(video_duration, 0) > 60,
    updated_at = NOW();

WITH open_payout_totals AS (
    SELECT
        vp.id,
        COALESCE(SUM(vv.view_count), 0) AS eligible_views
    FROM video_payouts vp
    LEFT JOIN video_views vv
        ON vv.creator_id = vp.creator_id
        AND vv.period_month = vp.period_month
        AND vv.eligible = true
        AND COALESCE(vv.video_duration, 0) > 60
    WHERE vp.status IN ('pending', 'processing')
    GROUP BY vp.id
)
UPDATE video_payouts vp
SET
    views = totals.eligible_views,
    amount_gross = ROUND(((totals.eligible_views / 1000.0) * vp.rpm_rate)::numeric, 2),
    amount_commission_xera = ROUND((((totals.eligible_views / 1000.0) * vp.rpm_rate) * 0.20)::numeric, 2),
    amount_net_creator = ROUND((((totals.eligible_views / 1000.0) * vp.rpm_rate) * 0.80)::numeric, 2),
    updated_at = NOW()
FROM open_payout_totals totals
WHERE vp.id = totals.id;
