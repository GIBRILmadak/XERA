-- ========================================
-- FONCTIONS SQL AVANCÉES POUR LA MONÉTISATION
-- ========================================

-- Fonction pour calculer les revenus d'une période
CREATE OR REPLACE FUNCTION calculate_creator_revenue_period(
    p_creator_id UUID,
    p_start_date TIMESTAMP WITH TIME ZONE,
    p_end_date TIMESTAMP WITH TIME ZONE
)
RETURNS TABLE (
    total_gross DECIMAL,
    total_net DECIMAL,
    total_commission DECIMAL,
    support_revenue DECIMAL,
    video_revenue DECIMAL,
    transaction_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COALESCE(SUM(t.amount_gross), 0) as total_gross,
        COALESCE(SUM(t.amount_net_creator), 0) as total_net,
        COALESCE(SUM(t.amount_commission_xera), 0) as total_commission,
        COALESCE(SUM(CASE WHEN t.type = 'support' THEN t.amount_net_creator ELSE 0 END), 0) as support_revenue,
        COALESCE(SUM(CASE WHEN t.type = 'video_rpm' THEN t.amount_net_creator ELSE 0 END), 0) as video_revenue,
        COUNT(*) as transaction_count
    FROM transactions t
    WHERE t.to_user_id = p_creator_id
        AND t.status = 'succeeded'
        AND t.created_at >= p_start_date
        AND t.created_at <= p_end_date;
END;
$$ LANGUAGE plpgsql;

-- Fonction pour créer un payout vidéo mensuel
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
    -- Calculer les vues éligibles du mois
    SELECT COALESCE(SUM(view_count), 0)
    INTO v_total_views
    FROM video_views
    WHERE creator_id = p_creator_id
        AND period_month = p_period_month
        AND eligible = true;
    
    -- Calculer le montant brut
    v_amount_gross := (v_total_views / 1000.0) * 0.40;
    
    -- Créer le payout
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

-- Fonction pour vérifier et mettre à jour le statut de monétisation
CREATE OR REPLACE FUNCTION check_and_update_monetization_status(
    p_user_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
    v_user_record RECORD;
    v_should_be_monetized BOOLEAN;
BEGIN
    -- Récupérer les données utilisateur
    SELECT plan, plan_status, followers_count
    INTO v_user_record
    FROM users
    WHERE id = p_user_id;
    
    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;
    
    -- Déterminer si l'utilisateur devrait être monétisé
    v_should_be_monetized := 
        v_user_record.plan IN ('medium', 'pro') AND
        v_user_record.plan_status = 'active' AND
        v_user_record.followers_count >= 1000;
    
    -- Mettre à jour si nécessaire
    UPDATE users
    SET 
        is_monetized = v_should_be_monetized,
        updated_at = NOW()
    WHERE id = p_user_id
        AND is_monetized IS DISTINCT FROM v_should_be_monetized;
    
    RETURN v_should_be_monetized;
END;
$$ LANGUAGE plpgsql;

-- Fonction pour obtenir les statistiques d'un créateur
CREATE OR REPLACE FUNCTION get_creator_stats(p_creator_id UUID)
RETURNS TABLE (
    total_revenue DECIMAL,
    total_views BIGINT,
    total_followers INTEGER,
    monthly_revenue DECIMAL,
    is_monetized BOOLEAN,
    current_plan TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COALESCE((
            SELECT SUM(t.amount_net_creator)
            FROM transactions t
            WHERE t.to_user_id = p_creator_id AND t.status = 'succeeded'
        ), 0) as total_revenue,
        COALESCE((
            SELECT SUM(v.view_count)
            FROM video_views v
            WHERE v.creator_id = p_creator_id AND v.eligible = true
        ), 0) as total_views,
        u.followers_count as total_followers,
        COALESCE((
            SELECT SUM(t.amount_net_creator)
            FROM transactions t
            WHERE t.to_user_id = p_creator_id 
                AND t.status = 'succeeded'
                AND t.created_at >= DATE_TRUNC('month', NOW())
        ), 0) as monthly_revenue,
        u.is_monetized,
        u.plan as current_plan
    FROM users u
    WHERE u.id = p_creator_id;
END;
$$ LANGUAGE plpgsql;

-- Fonction pour logger une action d'audit
CREATE OR REPLACE FUNCTION log_monetization_action(
    p_user_id UUID,
    p_action TEXT,
    p_entity_type TEXT,
    p_entity_id UUID,
    p_old_values JSONB DEFAULT NULL,
    p_new_values JSONB DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
    INSERT INTO monetization_audit_logs (
        user_id,
        action,
        entity_type,
        entity_id,
        old_values,
        new_values,
        user_agent
    )
    VALUES (
        p_user_id,
        p_action,
        p_entity_type,
        p_entity_id,
        p_old_values,
        p_new_values,
        current_setting('request.headers', true)::json->>'user-agent'
    );
END;
$$ LANGUAGE plpgsql;

-- Trigger pour mettre à jour automatiquement les revenus après transaction
CREATE OR REPLACE FUNCTION after_transaction_insert()
RETURNS TRIGGER AS $$
BEGIN
    -- Logger l'action si c'est un soutien
    IF NEW.type = 'support' AND NEW.status = 'succeeded' THEN
        PERFORM log_monetization_action(
            NEW.to_user_id,
            'support_received',
            'transaction',
            NEW.id,
            NULL,
            jsonb_build_object(
                'amount_gross', NEW.amount_gross,
                'amount_net', NEW.amount_net_creator
            )
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Appliquer le trigger
DROP TRIGGER IF EXISTS trigger_after_transaction_insert ON transactions;
CREATE TRIGGER trigger_after_transaction_insert
    AFTER INSERT ON transactions
    FOR EACH ROW
    EXECUTE FUNCTION after_transaction_insert();

-- Vue pour le leaderboard des créateurs (top revenus)
CREATE OR REPLACE VIEW top_creators AS
SELECT 
    u.id,
    u.name,
    u.username,
    u.avatar,
    u.plan,
    u.is_monetized,
    COALESCE(SUM(t.amount_net_creator), 0) as total_revenue,
    COUNT(DISTINCT t.from_user_id) as unique_supporters,
    u.followers_count
FROM users u
LEFT JOIN transactions t ON t.to_user_id = u.id AND t.status = 'succeeded'
WHERE u.is_monetized = true
GROUP BY u.id
ORDER BY total_revenue DESC;

-- Index supplémentaires pour performance
CREATE INDEX IF NOT EXISTS idx_transactions_date_type 
    ON transactions(created_at, type) 
    WHERE status = 'succeeded';

CREATE INDEX IF NOT EXISTS idx_video_views_aggregation 
    ON video_views(creator_id, period_month, eligible) 
    WHERE eligible = true;

-- Fonction pour nettoyer les vieilles données (GDPR)
CREATE OR REPLACE FUNCTION anonymize_old_transactions(
    p_before_date TIMESTAMP WITH TIME ZONE
)
RETURNS INTEGER AS $$
DECLARE
    v_count INTEGER;
BEGIN
    UPDATE transactions
    SET 
        from_user_id = NULL,
        metadata = NULL,
        description = 'Anonymisé'
    WHERE created_at < p_before_date
        AND from_user_id IS NOT NULL;
    
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$ LANGUAGE plpgsql;
