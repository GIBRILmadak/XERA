-- ========================================
-- CORRECTION COMPLÈTE: Compteurs followers à 0
-- ========================================
-- 
-- Ce script corrige tous les problèmes de compteurs d'abonnés
-- Exécutez-le COMPLÈTEMENT dans Supabase SQL Editor
--
-- INSTRUCTIONS:
-- 1. Allez à https://app.supabase.com → Votre projet XERA
-- 2. SQL Editor → New Query
-- 3. Copiez-collez TOUT ce contenu
-- 4. Cliquez "Run" ou Cmd/Ctrl + Enter
-- 5. Attendez "Query succeeded" ✅
--
-- ========================================

-- ========================================
-- ÉTAPE 1: Vérifier/Ajouter la colonne followers_count dans users
-- ========================================
ALTER TABLE users ADD COLUMN IF NOT EXISTS followers_count INTEGER DEFAULT 0;

-- ========================================
-- ÉTAPE 2: Créer/Corriger la table followers
-- ========================================

-- Vérifier si la table existe, sinon la créer
CREATE TABLE IF NOT EXISTS followers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    follower_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    following_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(follower_id, following_id)
);

-- Créer les index pour améliorer les performances
CREATE INDEX IF NOT EXISTS idx_followers_follower_id ON followers(follower_id);
CREATE INDEX IF NOT EXISTS idx_followers_following_id ON followers(following_id);
CREATE INDEX IF NOT EXISTS idx_followers_created_at ON followers(created_at);

-- ========================================
-- ÉTAPE 3: Activer Row Level Security
-- ========================================

ALTER TABLE followers ENABLE ROW LEVEL SECURITY;

-- ========================================
-- ÉTAPE 4: Nettoyer les anciennes policies
-- ========================================

-- Supprimer toutes les variantes de noms de policy connues (idempotent)
DROP POLICY IF EXISTS "Les followers sont visibles par tous" ON followers;
DROP POLICY IF EXISTS "Les utilisateurs peuvent suivre d'autres" ON followers;
DROP POLICY IF EXISTS "Les utilisateurs peuvent se désabonner" ON followers;
DROP POLICY IF EXISTS "Followers lisibles par tous" ON followers;
DROP POLICY IF EXISTS "Utilisateurs peuvent suivre" ON followers;
DROP POLICY IF EXISTS "Utilisateurs peuvent se désabonner" ON followers;

-- ========================================
-- ÉTAPE 5: Créer les NOUVELLES RLS Policies
-- ========================================

-- Policy 1: LECTURE - Tout le monde peut voir les relations de suivi
CREATE POLICY "Followers lisibles par tous" ON followers
    FOR SELECT
    USING (true);

-- Policy 2: AJOUT - Seul le follower_id authentifié peut s'abonner
CREATE POLICY "Utilisateurs peuvent suivre" ON followers
    FOR INSERT
    WITH CHECK (auth.uid() = follower_id);

-- Policy 3: SUPPRESSION - Seul le follower_id peut se désabonner
CREATE POLICY "Utilisateurs peuvent se désabonner" ON followers
    FOR DELETE
    USING (auth.uid() = follower_id);

-- ========================================
-- ÉTAPE 6: Nettoyer les vieux triggers
-- ========================================

DROP TRIGGER IF EXISTS followers_count_update ON followers;
DROP FUNCTION IF EXISTS update_followers_count();

-- ========================================
-- ÉTAPE 7: Créer la NOUVELLE fonction de trigger
-- ========================================

CREATE OR REPLACE FUNCTION update_followers_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
    v_user_id UUID;
    v_count INTEGER;
BEGIN
    -- Déterminer l'utilisateur affecté selon l'opération
    IF TG_OP = 'INSERT' THEN
        v_user_id := NEW.following_id;
    ELSIF TG_OP = 'DELETE' THEN
        v_user_id := OLD.following_id;
    END IF;
    
    -- Compter les vrais followers de cet utilisateur
    v_count := (
        SELECT COUNT(DISTINCT follower_id) 
        FROM followers 
        WHERE following_id = v_user_id
    );
    
    -- Mettre à jour le compteur dans la table users
    UPDATE users 
    SET followers_count = v_count,
        updated_at = NOW()
    WHERE id = v_user_id;
    
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

-- ========================================
-- ÉTAPE 8: Créer le trigger
-- ========================================

CREATE TRIGGER followers_count_update 
AFTER INSERT OR DELETE ON followers
FOR EACH ROW 
EXECUTE FUNCTION update_followers_count();

-- ========================================
-- ÉTAPE 9: RECALCULER TOUS LES COMPTEURS
-- ========================================
-- Réinitialise et recalcule les compteurs de TOUS les utilisateurs

UPDATE users 
SET followers_count = (
    SELECT COUNT(DISTINCT follower_id) 
    FROM followers 
    WHERE followers.following_id = users.id
)
WHERE id IN (SELECT DISTINCT following_id FROM followers)
   OR id IN (SELECT DISTINCT id FROM users WHERE followers_count > 0);

-- S'assurer que tous les autres utilisateurs ont 0
UPDATE users 
SET followers_count = 0 
WHERE id NOT IN (SELECT DISTINCT following_id FROM followers);

-- ========================================
-- ✅ VÉRIFICATION COMPLÈTE
-- ========================================
-- Décommentez ces lignes pour vérifier :

-- Voir la structure de la table followers:
-- SELECT * FROM followers LIMIT 5;

-- Voir les compteurs pour tous les utilisateurs:
-- SELECT id, name, followers_count FROM users ORDER BY followers_count DESC;

-- Compter le total de relations followers:
-- SELECT COUNT(*) as total_relationships FROM followers;

-- Vérifier que le trigger existe:
-- SELECT trigger_name, event_type FROM information_schema.triggers WHERE table_name = 'followers';

-- ========================================
-- 🎉 FIN! 
-- ========================================
-- Si vous voyez "Query succeeded", c'est bon ! 
-- L'app devrait maintenant:
-- ✓ Compter les followers correctement
-- ✓ Augmenter/diminuer le compteur quand on follow/unfollow
-- ✓ Afficher les bons compteurs sur chaque profil
