-- ================================================================
-- MOMENTUM ENGINE : ANALYSE DE VÉLOCITÉ ET MATCHING SIGNAL/BRUIT
-- ================================================================

-- Fonction pour calculer le score de momentum d'un utilisateur
-- Ce score est utilisé pour classer les builders dans le feed des institutions
CREATE OR REPLACE FUNCTION calculate_momentum_score(
    target_user_id UUID,
    viewer_id UUID DEFAULT NULL
) RETURNS NUMERIC AS $$
DECLARE
    velocity_score NUMERIC := 0;
    matching_score NUMERIC := 0;
    trust_score NUMERIC := 0;
    saas_boost NUMERIC := 0;
    golden_match_boost NUMERIC := 0;

    post_count INT;
    is_pro BOOLEAN;
    is_certified BOOLEAN;

    viewer_interests TEXT[];
    viewer_is_institution BOOLEAN := false;

    user_bio TEXT;
    user_tokens TEXT;
BEGIN
    -- 1. ANALYSE DE VÉLOCITÉ (Proof of Work)
    -- 1 post/jour = 100% de Momentum. Les builders qui postent plus montent à 200%+.
    SELECT count(*) INTO post_count
    FROM content
    WHERE user_id = target_user_id
    AND created_at >= NOW() - INTERVAL '7 days';

    velocity_score := (post_count / 7.0) * 100;

    -- 2. VÉRIFICATION INSTITUTIONNELLE (Confiance)
    -- +30 pts si certifié "Actif" par une organisation
    SELECT EXISTS (
        SELECT 1 FROM professional_certifications
        WHERE user_id = target_user_id AND status = 'active'
    ) INTO is_certified;

    IF is_certified THEN
        trust_score := 30;
    END IF;

    -- 3. ABONNEMENT PAYANT (SaaS)
    -- +20 pts pour les membres Pro
    SELECT (plan IN ('standard', 'medium', 'pro') AND plan_status = 'active') INTO is_pro
    FROM users
    WHERE id = target_user_id;

    IF is_pro THEN
        saas_boost := 20;
    END IF;

    -- 4. MATCHING PROFOND (Signal vs Bruit)
    -- Si le viewer est une institution, on compare ses besoins aux preuves du builder
    IF viewer_id IS NOT NULL THEN
        -- Vérifier si le viewer possède une page pro
        SELECT talent_interests, true INTO viewer_interests, viewer_is_institution
        FROM professional_pages
        WHERE owner_id = viewer_id
        LIMIT 1;

        IF viewer_is_institution AND viewer_interests IS NOT NULL AND array_length(viewer_interests, 1) > 0 THEN
            -- Récupérer les tokens du builder (bio, arcs, tags, descriptions)
            SELECT COALESCE(bio, '') INTO user_bio FROM users WHERE id = target_user_id;

            -- On agrège les titres d'arcs, descriptions et tags de contenus
            SELECT string_agg(t, ' ') INTO user_tokens
            FROM (
                SELECT title FROM arcs WHERE user_id = target_user_id
                UNION ALL
                SELECT description FROM arcs WHERE user_id = target_user_id
                UNION ALL
                SELECT title FROM content WHERE user_id = target_user_id
                UNION ALL
                SELECT description FROM content WHERE user_id = target_user_id
                UNION ALL
                SELECT unnest(tags) FROM content WHERE user_id = target_user_id
            ) AS tokens(t);

            -- Matching simple par mots-clés
            SELECT count(*) * 5 INTO matching_score
            FROM unnest(viewer_interests) AS interest
            WHERE user_tokens ILIKE '%' || interest || '%'
            OR user_bio ILIKE '%' || interest || '%';

            matching_score := LEAST(matching_score, 25); -- Plafond à 25 pts

            -- GOLDEN MATCH : Recherche d'investisseurs / talents
            -- Si institution finance + builder "cherche investisseurs" = +25 pts
            IF (
                EXISTS (SELECT 1 FROM professional_pages WHERE owner_id = viewer_id AND (industry ILIKE '%finance%' OR bio ILIKE '%invest%'))
                AND (
                    EXISTS (SELECT 1 FROM arcs WHERE user_id = target_user_id AND 'cherche_investissement' = ANY(opportunity_intents))
                    OR user_bio ILIKE '%investisseur%'
                    OR user_tokens ILIKE '%cherche investisseur%'
                )
            ) THEN
                golden_match_boost := 25;
            END IF;
        END IF;
    END IF;

    -- Calcul du score final
    RETURN ROUND(
        (velocity_score * 0.4) +
        matching_score +
        trust_score +
        saas_boost +
        golden_match_boost
    );
END;
$$ LANGUAGE plpgsql STABLE;

-- Fonction pour récupérer le feed Momentum personnalisé
CREATE OR REPLACE FUNCTION get_momentum_explorer_feed(viewer_uuid UUID DEFAULT NULL)
RETURNS TABLE (
    id UUID,
    name TEXT,
    avatar TEXT,
    title TEXT,
    bio TEXT,
    badge TEXT,
    plan TEXT,
    account_subtype TEXT,
    momentum_score NUMERIC,
    updated_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        u.id, u.name, u.avatar, u.title, u.bio, u.badge, u.plan, u.account_subtype,
        calculate_momentum_score(u.id, viewer_uuid) as m_score,
        u.updated_at
    FROM users u
    WHERE u.account_type = 'personal' OR u.account_type IS NULL
    ORDER BY m_score DESC, u.updated_at DESC;
END;
$$ LANGUAGE plpgsql STABLE;

-- Vue pour le Momentum Feed par défaut (sans viewer spécifique)
CREATE OR REPLACE VIEW momentum_discovery_feed AS
SELECT * FROM get_momentum_explorer_feed(NULL);
