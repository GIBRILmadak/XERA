-- ======================================
-- XERA ENGAGEMENT TRACKING INFRASTRUCTURE
-- Schema pour l'algorithme de recommandation sophistiqué
-- ======================================

-- ==========================================
-- 1. USER ENGAGEMENT INTERACTIONS
-- Comme/Share/Save actions des utilisateurs
-- ==========================================

CREATE TABLE IF NOT EXISTS user_interactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    viewer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    target_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    interaction_type TEXT NOT NULL CHECK (interaction_type IN ('view', 'like', 'share', 'comment', 'bookmark', 'follow')),
    content_id UUID, -- NULL pour interactions utilisateur, sinon video/stream ID
    content_type TEXT, -- 'video', 'stream', 'profile', etc.
    interaction_data JSONB DEFAULT '{}', -- Données supplémentaires (contexte, etc.)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_user_interactions_viewer ON user_interactions(viewer_id);
CREATE INDEX idx_user_interactions_target ON user_interactions(target_user_id);
CREATE INDEX idx_user_interactions_type ON user_interactions(interaction_type);
CREATE INDEX idx_user_interactions_created ON user_interactions(created_at DESC);
CREATE INDEX idx_user_interactions_target_type ON user_interactions(target_user_id, interaction_type);

-- ==========================================
-- 2. CONTENT ENGAGEMENT METRICS
-- Métriques d'engagement pour chaque contenu
-- ==========================================

CREATE TABLE IF NOT EXISTS content_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content_id UUID NOT NULL,
    content_type TEXT NOT NULL,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    view_count INT DEFAULT 0,
    completion_rate NUMERIC(5, 2) DEFAULT 0, -- Pourcentage (0-100)
    avg_watch_time INT DEFAULT 0, -- en secondes
    engagement_score NUMERIC(5, 2) DEFAULT 0, -- Score composite (0-100)
    like_count INT DEFAULT 0,
    share_count INT DEFAULT 0,
    comment_count INT DEFAULT 0,
    bookmark_count INT DEFAULT 0,
    repeat_viewer_count INT DEFAULT 0,
    unique_viewer_count INT DEFAULT 0,
    period_date DATE DEFAULT CURRENT_DATE,
    period_month DATE DEFAULT DATE_TRUNC('month', CURRENT_DATE)::DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_content_metrics_user ON content_metrics(user_id);
CREATE INDEX idx_content_metrics_type ON content_metrics(content_type);
CREATE INDEX idx_content_metrics_date ON content_metrics(period_date DESC);
CREATE INDEX idx_content_metrics_engagement ON content_metrics(engagement_score DESC);

-- ==========================================
-- 3. USER RETENTION SIGNALS
-- Signaux de rétention pour chaque utilisateur
-- ==========================================

CREATE TABLE IF NOT EXISTS user_retention_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    return_visitor_count INT DEFAULT 0,
    return_visitor_rate NUMERIC(5, 2) DEFAULT 0, -- Pourcentage
    total_viewer_sessions INT DEFAULT 0,
    avg_session_duration INT DEFAULT 0, -- en secondes
    avg_watch_time INT DEFAULT 0,
    repeat_viewer_count INT DEFAULT 0,
    new_follower_from_content INT DEFAULT 0, -- Followers gagnés
    churn_risk_score NUMERIC(5, 2) DEFAULT 0, -- Score de risque (0-100)
    growth_velocity NUMERIC(10, 2) DEFAULT 0, -- Followers per day
    weekly_view_growth NUMERIC(5, 2) DEFAULT 0, -- Croissance semaine/semaine
    period_date DATE DEFAULT CURRENT_DATE,
    period_week DATE DEFAULT DATE_TRUNC('week', CURRENT_DATE)::DATE,
    period_month DATE DEFAULT DATE_TRUNC('month', CURRENT_DATE)::DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_user_retention_user ON user_retention_metrics(user_id);
CREATE INDEX idx_user_retention_date ON user_retention_metrics(period_date DESC);
CREATE INDEX idx_user_retention_growth ON user_retention_metrics(weekly_view_growth DESC);

-- ==========================================
-- 4. ENGAGEMENT VELOCITY TRACKING
-- Vitesse d'engagement en temps réel
-- ==========================================

CREATE TABLE IF NOT EXISTS engagement_velocity (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    content_id UUID,
    event_type TEXT NOT NULL, -- 'view', 'like', 'share', etc.
    hour_slot TIMESTAMP WITH TIME ZONE NOT NULL,
    count INT DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, content_id, event_type, hour_slot)
);

CREATE INDEX idx_engagement_velocity_user ON engagement_velocity(user_id);
CREATE INDEX idx_engagement_velocity_hour ON engagement_velocity(hour_slot DESC);
CREATE INDEX idx_engagement_velocity_type ON engagement_velocity(event_type);

-- ==========================================
-- 5. USER AFFINITY MATRIX
-- Personnalisation: quelle contenu l'utilisateur aime
-- ==========================================

CREATE TABLE IF NOT EXISTS user_affinity (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    viewer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    target_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    affinity_score NUMERIC(5, 2) DEFAULT 0, -- Score 0-100
    interaction_count INT DEFAULT 0,
    last_interaction TIMESTAMP WITH TIME ZONE,
    affinity_factors JSONB DEFAULT '{}', -- {account_type, plan, badge, etc.}
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(viewer_id, target_user_id)
);

CREATE INDEX idx_user_affinity_viewer ON user_affinity(viewer_id);
CREATE INDEX idx_user_affinity_score ON user_affinity(affinity_score DESC);

-- ==========================================
-- 6. FEED IMPRESSIONS TRACKING
-- Quels contenus sont montrés à quel utilisateur
-- ==========================================

CREATE TABLE IF NOT EXISTS feed_impressions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    viewer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    creator_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    impression_type TEXT NOT NULL, -- 'immersive', 'regular', 'discover'
    position INT, -- Position dans le feed (1-100)
    was_clicked BOOLEAN DEFAULT FALSE,
    engagement_type TEXT, -- Quelle action après l'impression
    engagement_duration INT, -- Temps passé en secondes
    recommendation_score NUMERIC(5, 2), -- Score du ranking algorithm
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_feed_impressions_viewer ON feed_impressions(viewer_id);
CREATE INDEX idx_feed_impressions_creator ON feed_impressions(creator_id);
CREATE INDEX idx_feed_impressions_clicked ON feed_impressions(was_clicked);
CREATE INDEX idx_feed_impressions_date ON feed_impressions(created_at DESC);

-- ==========================================
-- 7. EXTENSIONS POUR TABLE 'users' EXISTANTE
-- Ajouter les colonnes manquantes pour l'algo
-- ==========================================

-- Note: Exécuter ces ALTER TABLE uniquement si les colonnes n'existent pas

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'priority_recommendations') THEN
        ALTER TABLE public.users ADD COLUMN priority_recommendations BOOLEAN DEFAULT FALSE;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'momentum_score') THEN
        ALTER TABLE public.users ADD COLUMN momentum_score NUMERIC(10, 2) DEFAULT 0;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'active_days') THEN
        ALTER TABLE public.users ADD COLUMN active_days INT DEFAULT 0;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'consistency_ratio') THEN
        ALTER TABLE public.users ADD COLUMN consistency_ratio NUMERIC(5, 2) DEFAULT 0;
    END IF;
END $$;

-- ==========================================
-- 8. MATERIALIZED VIEW - SCORES JOURNALIERS
-- Pour performarce: pré-calcule les scores
-- ==========================================

CREATE OR REPLACE VIEW user_engagement_scores AS
SELECT
    u.id as user_id,
    u.name,
    u.followers_count,
    u.plan,
    COALESCE(cm.view_count, 0) as total_views,
    COALESCE(cm.engagement_score, 0) as avg_engagement_score,
    COALESCE(urm.return_visitor_rate, 0) as return_visitor_rate,
    COALESCE(urm.weekly_view_growth, 0) as weekly_view_growth,
    COALESCE(u.momentum_score, 0) as momentum_score,
    u.updated_at,
    CURRENT_TIMESTAMP as calculated_at
FROM public.users u
LEFT JOIN content_metrics cm ON u.id = cm.user_id AND cm.period_date = CURRENT_DATE
LEFT JOIN user_retention_metrics urm ON u.id = urm.user_id AND urm.period_date = CURRENT_DATE;

-- ==========================================
-- 9. RLS POLICIES (Row Level Security)
-- ==========================================

-- Permettre aux utilisateurs de voir les interactions les concernant
ALTER TABLE user_interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE feed_impressions ENABLE ROW LEVEL SECURITY;

-- Les utilisateurs ne peuvent voir que leurs propres interactions
CREATE POLICY "Users can view own interactions" ON user_interactions
    FOR SELECT USING (auth.uid() = viewer_id);

-- Les utilisateurs peuvent voir les métriques de contenu pour leur compte
CREATE POLICY "Users can view own content metrics" ON content_metrics
    FOR SELECT USING (auth.uid() = user_id);

-- Service role peut tout voir/modifier
CREATE POLICY "Service role can manage interactions" ON user_interactions
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role can manage metrics" ON content_metrics
    FOR ALL USING (auth.role() = 'service_role');

-- ==========================================
-- 10. FONCTION: Mise à jour automatique des scores
-- ==========================================

CREATE OR REPLACE FUNCTION update_engagement_scores()
RETURNS void AS $$
DECLARE
    user_rec RECORD;
BEGIN
    -- Pour chaque créateur, calcule son score composite
    FOR user_rec IN SELECT DISTINCT user_id FROM content_metrics WHERE period_date = CURRENT_DATE
    LOOP
        -- Mise à jour momentum_score
        UPDATE public.users
        SET
            momentum_score = (
                SELECT COALESCE(AVG(engagement_score), 0)
                FROM content_metrics
                WHERE user_id = user_rec.user_id
                AND period_month = DATE_TRUNC('month', CURRENT_DATE)::DATE
            ),
            updated_at = NOW()
        WHERE id = user_rec.user_id;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- ==========================================
-- NOTES D'UTILISATION
-- ==========================================
/*
1. INTERACTION TRACKING côté client:
   - POST /api/app/interaction/track
   - Body: { interaction_type, target_user_id, content_type, content_id }

2. FEED IMPRESSIONS:
   - Trackée après chaque affichage de feed
   - Permet mesurer CTR et engagement

3. AFFINITY SCORES:
   - Mis à jour après chaque interaction
   - Utilisé pour la personnalisation du feed

4. MAINTENANCE:
   - Run `SELECT update_engagement_scores()` once per day
   - Archive ancien data (>90 jours) pour perf
*/
