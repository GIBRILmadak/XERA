-- ========================================
-- PORTEFEUILLE CRÉATEUR & RETRAITS MOBILE MONEY
-- À exécuter sur une base déjà initialisée avec monetization-schema.sql
-- ========================================

CREATE TABLE IF NOT EXISTS creator_payout_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    channel TEXT NOT NULL CHECK (channel IN ('mobile_money')) DEFAULT 'mobile_money',
    provider TEXT NOT NULL CHECK (provider IN ('airtel_money', 'orange_money', 'mpesa', 'afrimoney', 'other')),
    account_name TEXT NOT NULL,
    wallet_number TEXT NOT NULL,
    country_code TEXT DEFAULT 'CD',
    status TEXT NOT NULL CHECK (status IN ('active', 'inactive')) DEFAULT 'active',
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_creator_payout_settings_user_id
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
    amount_usd DECIMAL(10, 2) NOT NULL CHECK (amount_usd > 0),
    requested_amount DECIMAL(10, 2) NOT NULL CHECK (requested_amount > 0),
    requested_currency TEXT NOT NULL DEFAULT 'USD',
    channel TEXT NOT NULL CHECK (channel IN ('mobile_money')) DEFAULT 'mobile_money',
    provider TEXT NOT NULL CHECK (provider IN ('airtel_money', 'orange_money', 'mpesa', 'afrimoney', 'other')),
    wallet_number TEXT NOT NULL,
    account_name TEXT NOT NULL,
    note TEXT,
    status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'paid', 'rejected', 'canceled')) DEFAULT 'pending',
    operator_ref_id TEXT,
    admin_note TEXT,
    requested_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    processed_at TIMESTAMP WITH TIME ZONE,
    paid_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

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

ALTER TABLE creator_payout_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE withdrawal_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own payout settings"
    ON creator_payout_settings;
CREATE POLICY "Users can view own payout settings" ON creator_payout_settings
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage own payout settings"
    ON creator_payout_settings;
CREATE POLICY "Users can manage own payout settings" ON creator_payout_settings
    FOR ALL USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own withdrawal requests"
    ON withdrawal_requests;
CREATE POLICY "Users can view own withdrawal requests" ON withdrawal_requests
    FOR SELECT USING (auth.uid() = creator_id);

DROP POLICY IF EXISTS "Users can create own withdrawal requests"
    ON withdrawal_requests;
CREATE POLICY "Users can create own withdrawal requests" ON withdrawal_requests
    FOR INSERT WITH CHECK (auth.uid() = creator_id);

DROP POLICY IF EXISTS "Users can update own pending withdrawal requests"
    ON withdrawal_requests;
CREATE POLICY "Users can update own pending withdrawal requests" ON withdrawal_requests
    FOR UPDATE USING (
        auth.uid() = creator_id
        AND status IN ('pending')
    )
    WITH CHECK (
        auth.uid() = creator_id
        AND status IN ('pending', 'canceled')
    );
