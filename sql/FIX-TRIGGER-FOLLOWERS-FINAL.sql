-- ========================================
-- FIX COMPLET: Trigger amélioré pour followers
-- ========================================
-- 
-- Ce script améliore le trigger pour qu'il fonctionne CORRECTEMENT
-- même si le code JavaScript n'appelle pas updateFollowersAndMonetization
--

-- 1. SUPPRIMER L'ANCIEN TRIGGER
DROP TRIGGER IF EXISTS followers_count_update ON followers;

-- 2. SUPPRIMER L'ANCIENNE FONCTION
DROP FUNCTION IF EXISTS update_followers_count();

-- 3. CRÉER UNE NOUVELLE FONCTION AMÉLIORÉE
CREATE OR REPLACE FUNCTION update_followers_count()
RETURNS TRIGGER AS $$
DECLARE
    v_following_id UUID;
    v_new_count INTEGER;
BEGIN
    IF TG_OP = 'INSERT' THEN
        v_following_id := NEW.following_id;
        
        -- Compter les vrais followers
        v_new_count := (
            SELECT COUNT(*) 
            FROM followers 
            WHERE following_id = v_following_id
        );
        
        -- Mettre à jour le compteur
        UPDATE users 
        SET followers_count = v_new_count,
            updated_at = NOW()
        WHERE id = v_following_id;
        
        RETURN NEW;
        
    ELSIF TG_OP = 'DELETE' THEN
        v_following_id := OLD.following_id;
        
        -- Compter les vrais followers (APRÈS suppression)
        v_new_count := (
            SELECT COUNT(*) 
            FROM followers 
            WHERE following_id = v_following_id
        );
        
        -- Mettre à jour le compteur
        UPDATE users 
        SET followers_count = v_new_count,
            updated_at = NOW()
        WHERE id = v_following_id;
        
        RETURN OLD;
    END IF;
    
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- 4. CRÉER LE NOUVEAU TRIGGER
CREATE TRIGGER followers_count_update 
AFTER INSERT OR DELETE ON followers
FOR EACH ROW 
EXECUTE FUNCTION update_followers_count();

-- 5. FORCER LA RECALCUL DE TOUS LES COMPTEURS
UPDATE users SET followers_count = 0 WHERE followers_count IS NOT NULL;

UPDATE users 
SET followers_count = (
    SELECT COUNT(*) 
    FROM followers 
    WHERE followers.following_id = users.id
);

-- 6. VÉRIFIER LE RÉSULTAT
SELECT 
    'Vérification finale' as "Étape",
    COUNT(*) as "Utilisateurs avec followers",
    SUM(followers_count) as "Total followers comptés"
FROM users
WHERE followers_count > 0;

SELECT 
    u.name,
    u.followers_count as "Compteur",
    (SELECT COUNT(*) FROM followers WHERE following_id = u.id) as "Vrais followers",
    CASE 
        WHEN u.followers_count = (SELECT COUNT(*) FROM followers WHERE following_id = u.id) 
        THEN '✅ Correct'
        ELSE '❌ Erreur'
    END as "Status"
FROM users u
WHERE u.followers_count > 0 OR EXISTS (SELECT 1 FROM followers WHERE following_id = u.id)
LIMIT 50;

-- ========================================
-- FAIT !
-- Les triggers devraient maintenant fonctionner correctement.
-- Testez en vous abonnant/désabonnant d'un utilisateur.
-- ========================================
