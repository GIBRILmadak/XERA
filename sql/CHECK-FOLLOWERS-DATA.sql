-- ========================================
-- VÉRIFICATION: Où sont les données?
-- ========================================
-- 
-- Ce script vous montre si les données de suivis sont réellement insérées
-- Exécutez chaque requête séparément en copiant/collant
--

-- 1️⃣ VOIR TOUS LES SUIVIS EXISTANTS
-- Exécutez cette requête d'abord
SELECT COUNT(*) as "⬇️ Nombre de relations 'follow' dans followers" 
FROM followers;

-- ========================================
-- RÉSULTAT ATTENDU:
-- - Si "Nombre" > 0 → Les données existent
-- - Si "Nombre" = 0 → Les données ne s'insèrent pas
-- ========================================

-- ⏸️ PAUSE - Regardez le résultat ci-dessus avant de continuer

-- 2️⃣ VOIR DÉTAILS DES SUIVIS (Exécutez cette requête ensuite)
SELECT 
    id,
    follower_id,
    following_id,
    created_at
FROM followers
ORDER BY created_at DESC
LIMIT 50;

-- 3️⃣ VOIR LES COMPTEURS ACTUELS
SELECT 
    name,
    id,
    followers_count
FROM users
WHERE followers_count > 0
ORDER BY followers_count DESC
LIMIT 50;

-- Si aucun résultat, cela signifie: tous les compteurs sont à 0 ❌

-- 4️⃣ RÉSUMÉ FINAL
SELECT 
    (SELECT COUNT(*) FROM followers) as "Total relations suivi",
    (SELECT COUNT(*) FROM users WHERE followers_count > 0) as "Utilisateurs avec followers",
    (SELECT COALESCE(SUM(followers_count), 0) FROM users) as "Total compteurs";
