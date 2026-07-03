-- ========================================
-- DIAGNOSTIC & CORRECTION
-- ========================================
-- Exécutez ce script pour voir l'état réel et relancer les compteurs

-- 1. VÉRIFIER L'ÉTAT DE LA TABLE
SELECT 
    'Table followers' as "Élément",
    COUNT(*) as "Nombre de lignes",
    'Vérifier s''il y a des données' as "Note"
FROM followers
LIMIT 1;

-- 2. VÉRIFIER LES COMPTEURS ACTUELS
SELECT 
    name,
    id,
    followers_count,
    'Voici les compteurs actuels' as "Note"
FROM users
WHERE followers_count > 0 OR id IN (SELECT DISTINCT following_id FROM followers)
LIMIT 20;

-- 3. RECALCULER LES COMPTEURS (relancer tous les compteurs basés sur la vraie table followers)
-- Cette requête réinitialise et recalcule tous les compteurs
UPDATE users 
SET followers_count = (
    SELECT COUNT(*) 
    FROM followers 
    WHERE followers.following_id = users.id
)
WHERE id IN (SELECT DISTINCT following_id FROM followers)
   OR followers_count != (SELECT COUNT(*) FROM followers WHERE followers.following_id = users.id);

-- 4. VÉRIFIER QUE LES COMPTEURS SONT À JOUR
SELECT 
    u.name,
    u.id,
    u.followers_count as "followers_count dans users",
    (SELECT COUNT(*) FROM followers WHERE followers.following_id = u.id) as "vrais followers dans la table"
FROM users u
WHERE EXISTS (SELECT 1 FROM followers WHERE followers.following_id = u.id)
   OR u.followers_count > 0
LIMIT 20;

-- 5. VÉRIFIER QUE LES TRIGGERS EXISTENT
SELECT 
    trigger_name,
    event_object_table,
    event_manipulation,
    'Les triggers doivent exister' as "Note"
FROM information_schema.triggers
WHERE event_object_table = 'followers'
    AND trigger_schema NOT IN ('pg_catalog', 'information_schema');

-- 6. VÉRIFIER LA FONCTION DU TRIGGER
SELECT 
    routine_name,
    routine_type,
    'Fonction de trigger' as "Note"
FROM information_schema.routines
WHERE routine_name = 'update_followers_count'
    AND routine_schema NOT IN ('pg_catalog', 'information_schema');

-- ========================================
-- RÉSUMÉ
-- ========================================
-- Si tout est OK, vous devriez voir :
-- ✅ La table followers existe et a des données
-- ✅ Les triggers existent
-- ✅ La fonction update_followers_count existe
-- ✅ Les compteurs correspondent aux vrais followers
-- 
-- Si ce n'est pas le cas, exécutez FIX-FOLLOWERS-ZERO-BUG.sql à nouveau
-- ========================================
