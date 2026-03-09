-- ========================================
-- SCHÉMA MONÉTISATION XERA
-- ========================================

-- ========================================
-- 1. MISE À JOUR TABLE USERS (PROFILES)
-- ========================================

-- Ajouter les colonnes de monétisation à la table users
ALTER TABLE users ADD COLUMN IF NOT EXISTS plan TEXT CHECK (plan IN ('free', 'standard', 'medium', 'pro')) DEFAULT 'free';
ALTER TABLE users ADD COLUMN IF NOT EXISTS plan_status TEXT CHECK (plan_status IN ('inactive', 'active', 'past_due', 'canceled')) DEFAULT 'inactive';
ALTER TABLE users ADD COLUMN IF NOT EXISTS plan_ends_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_monetized BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS payapay_account_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS followers_count INTEGER DEFAULT 0;

-- Index pour les performances
CREATE INDEX IF NOT EXISTS idx_users_plan ON users(plan);
CREATE INDEX IF NOT EXISTS idx_users_plan_status ON users(plan_status);
CREATE INDEX IF NOT EXISTS idx_users_is_monetized ON users(is_monetized);

-- ========================================
-- 2. TABLE SUBSCRIPTIONS
-- ========================================

CREATE TABLE IF NOT EXISTS subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan TEXT NOT NULL CHECK (plan IN ('standard', 'medium', 'pro')),
    status TEXT NOT NULL CHECK (status IN ('active', 'canceled', 'past_due', 'incomplete', 'incomplete_expired')),
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    current_period_start TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    current_period_end TIMESTAMP WITH TIME ZONE,
    payapay_subscription_id TEXT,
    payapay_customer_id TEXT,
    cancel_at_period_end BOOLEAN DEFAULT false,
    canceled_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index pour subscriptions
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_plan ON subscriptions(plan);
CREATE INDEX IF NOT EXISTS idx_subscriptions_payapay_id ON subscriptions(payapay_subscription_id);

-- Trigger pour updated_at
CREATE TRIGGER update_subscriptions_updated_at BEFORE UPDATE ON subscriptions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ========================================
-- 3. TABLE TRANSACTIONS (SOUTIENS/TIPS)
-- ========================================

CREATE TABLE IF NOT EXISTS transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    from_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    to_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('support', 'video_rpm', 'subscription', 'other')),
    amount_gross DECIMAL(10, 2) NOT NULL,
    amount_net_creator DECIMAL(10, 2) NOT NULL,
    amount_commission_xera DECIMAL(10, 2) NOT NULL,
    currency TEXT DEFAULT 'USD',
    payapay_payment_id TEXT,
    payapay_transfer_id TEXT,
    status TEXT NOT NULL CHECK (status IN ('pending', 'succeeded', 'failed', 'refunded', 'canceled')),
    description TEXT,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index pour transactions
CREATE INDEX IF NOT EXISTS idx_transactions_from_user ON transactions(from_user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_to_user ON transactions(to_user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_transactions_payapay_id ON transactions(payapay_payment_id);

-- Trigger pour updated_at
CREATE TRIGGER update_transactions_updated_at BEFORE UPDATE ON transactions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ========================================
-- 4. TABLE VIDEO VIEWS (AGGRÉGATION)
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

-- Index pour video_views
CREATE INDEX IF NOT EXISTS idx_video_views_video_id ON video_views(video_id);
CREATE INDEX IF NOT EXISTS idx_video_views_creator_id ON video_views(creator_id);
CREATE INDEX IF NOT EXISTS idx_video_views_eligible ON video_views(eligible);
CREATE INDEX IF NOT EXISTS idx_video_views_period_date ON video_views(period_date);
CREATE INDEX IF NOT EXISTS idx_video_views_period_month ON video_views(period_month);

-- Trigger pour updated_at
CREATE TRIGGER update_video_views_updated_at BEFORE UPDATE ON video_views
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ========================================
-- 5. TABLE VIDEO PAYOUTS (REVENUS VIDÉO)
-- ========================================

CREATE TABLE IF NOT EXISTS video_payouts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    creator_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    period_month DATE NOT NULL,
    views BIGINT DEFAULT 0,
    rpm_rate DECIMAL(10, 4) DEFAULT 0.40,
    amount_gross DECIMAL(10, 2) NOT NULL,
    amount_net_creator DECIMAL(10, 2) NOT NULL,
    amount_commission_xera DECIMAL(10, 2) NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'paid', 'failed')),
    payapay_payout_id TEXT,
    paid_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(creator_id, period_month)
);

-- Index pour video_payouts
CREATE INDEX IF NOT EXISTS idx_video_payouts_creator_id ON video_payouts(creator_id);
CREATE INDEX IF NOT EXISTS idx_video_payouts_status ON video_payouts(status);
CREATE INDEX IF NOT EXISTS idx_video_payouts_period_month ON video_payouts(period_month);
CREATE INDEX IF NOT EXISTS idx_video_payouts_payapay_id ON video_payouts(payapay_payout_id);

-- Trigger pour updated_at
CREATE TRIGGER update_video_payouts_updated_at BEFORE UPDATE ON video_payouts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ========================================
-- 6. TABLE AUDIT LOGS (CONFORMITÉ)
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

-- Index pour audit logs
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON monetization_audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON monetization_audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON monetization_audit_logs(created_at);

-- ========================================
-- 7. RLS POLICIES
-- ========================================

-- Enable RLS
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE monetization_audit_logs ENABLE ROW LEVEL SECURITY;

-- Subscriptions Policies
CREATE POLICY "Users can view own subscriptions" ON subscriptions
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Only system can insert subscriptions" ON subscriptions
    FOR INSERT WITH CHECK (false);

CREATE POLICY "Only system can update subscriptions" ON subscriptions
    FOR UPDATE USING (false);

-- Transactions Policies
CREATE POLICY "Users can view transactions as sender" ON transactions
    FOR SELECT USING (auth.uid() = from_user_id);

CREATE POLICY "Users can view transactions as receiver" ON transactions
    FOR SELECT USING (auth.uid() = to_user_id);

CREATE POLICY "Only system can insert transactions" ON transactions
    FOR INSERT WITH CHECK (false);

CREATE POLICY "Only system can update transactions" ON transactions
    FOR UPDATE USING (false);

-- Video Views Policies
CREATE POLICY "Creators can view own video stats" ON video_views
    FOR SELECT USING (auth.uid() = creator_id);

CREATE POLICY "Only system can manage video views" ON video_views
    FOR ALL USING (false);

-- Video Payouts Policies
CREATE POLICY "Creators can view own payouts" ON video_payouts
    FOR SELECT USING (auth.uid() = creator_id);

CREATE POLICY "Only system can manage payouts" ON video_payouts
    FOR ALL USING (false);

-- Audit Logs Policies
CREATE POLICY "Users can view own audit logs" ON monetization_audit_logs
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Only system can insert audit logs" ON monetization_audit_logs
    FOR INSERT WITH CHECK (false);

-- ========================================
-- 8. FONCTIONS UTILITAIRES
-- ========================================

-- Fonction pour calculer le statut de monétisation
CREATE OR REPLACE FUNCTION calculate_monetization_status()
RETURNS TRIGGER AS $$
BEGIN
    -- Met à jour is_monetized si le plan est medium/pro ET followers >= 1000
    IF NEW.plan IN ('medium', 'pro') AND NEW.plan_status = 'active' AND NEW.followers_count >= 1000 THEN
        NEW.is_monetized = true;
    ELSE
        NEW.is_monetized = false;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger pour auto-calculer is_monetized
DROP TRIGGER IF EXISTS trigger_calculate_monetization ON users;
CREATE TRIGGER trigger_calculate_monetization
    BEFORE INSERT OR UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION calculate_monetization_status();

-- Fonction pour calculer les revenus d'une transaction
CREATE OR REPLACE FUNCTION calculate_transaction_amounts()
RETURNS TRIGGER AS $$
BEGIN
    -- Commission XERA de 20%
    NEW.amount_commission_xera = NEW.amount_gross * 0.20;
    -- Net créateur = 80%
    NEW.amount_net_creator = NEW.amount_gross * 0.80;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger pour auto-calculer les montants
DROP TRIGGER IF EXISTS trigger_calculate_transaction_amounts ON transactions;
CREATE TRIGGER trigger_calculate_transaction_amounts
    BEFORE INSERT ON transactions
    FOR EACH ROW
    EXECUTE FUNCTION calculate_transaction_amounts();

-- Fonction pour calculer les payouts vidéo
CREATE OR REPLACE FUNCTION calculate_video_payout_amounts()
RETURNS TRIGGER AS $$
BEGIN
    -- Calcul du montant brut: (vues / 1000) * taux RPM
    NEW.amount_gross = (NEW.views / 1000.0) * NEW.rpm_rate;
    -- Commission XERA de 20%
    NEW.amount_commission_xera = NEW.amount_gross * 0.20;
    -- Net créateur = 80%
    NEW.amount_net_creator = NEW.amount_gross * 0.80;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger pour auto-calculer les montants des payouts
DROP TRIGGER IF EXISTS trigger_calculate_payout_amounts ON video_payouts;
CREATE TRIGGER trigger_calculate_payout_amounts
    BEFORE INSERT ON video_payouts
    FOR EACH ROW
    EXECUTE FUNCTION calculate_video_payout_amounts();

-- ========================================
-- 9. VUES POUR LE DASHBOARD CRÉATEUR
-- ========================================

-- Vue pour les revenus totaux par créateur
CREATE OR REPLACE VIEW creator_revenue_summary AS
SELECT 
    to_user_id as creator_id,
    COUNT(*) as total_transactions,
    SUM(amount_gross) as total_gross_revenue,
    SUM(amount_net_creator) as total_net_revenue,
    SUM(amount_commission_xera) as total_xera_commission,
    SUM(CASE WHEN type = 'support' THEN amount_net_creator ELSE 0 END) as support_revenue,
    SUM(CASE WHEN type = 'video_rpm' THEN amount_net_creator ELSE 0 END) as video_revenue,
    MIN(created_at) as first_transaction,
    MAX(created_at) as last_transaction
FROM transactions
WHERE status = 'succeeded'
GROUP BY to_user_id;

-- Vue pour les statistiques mensuelles
CREATE OR REPLACE VIEW creator_monthly_stats AS
SELECT 
    to_user_id as creator_id,
    DATE_TRUNC('month', created_at) as month,
    COUNT(*) as transaction_count,
    SUM(amount_net_creator) as monthly_revenue,
    SUM(CASE WHEN type = 'support' THEN 1 ELSE 0 END) as support_count,
    SUM(CASE WHEN type = 'video_rpm' THEN 1 ELSE 0 END) as video_payout_count
FROM transactions
WHERE status = 'succeeded'
GROUP BY to_user_id, DATE_TRUNC('month', created_at);

-- ========================================
-- 10. DONNÉES INITIALES (OPTIONNEL)
-- ========================================

-- Mettre à jour les utilisateurs existants avec les valeurs par défaut
UPDATE users SET plan = 'free', plan_status = 'inactive', is_monetized = false WHERE plan IS NULL;
