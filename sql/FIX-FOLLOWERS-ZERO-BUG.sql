-- ========================================
-- FIX INSTANT: Compteurs d'abonnés à zéro
-- ========================================
-- 
-- PROBLÈME: Tous les utilisateurs affichent 0 abonnés
-- CAUSE: La table 'followers' n'existe pas
-- SOLUTION: Exécuter ce script une seule fois
--
-- INSTRUCTIONS:
-- 1. Allez à https://app.supabase.com → Votre projet
-- 2. SQL Editor → New Query (ou cliquez le + en haut)
-- 3. Collez TOUT ce contenu ci-dessous
-- 4. Cliquez "Run" ou Cmd/Ctrl + Enter
-- 5. Attendez le "Success" en vert
-- ========================================

-- ========================================
-- Étape 1: Créer la table followers
-- ========================================
CREATE TABLE IF NOT EXISTS followers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    follower_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    following_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(follower_id, following_id)
);

-- Index pour les performances
CREATE INDEX IF NOT EXISTS idx_followers_follower_id ON followers(follower_id);
CREATE INDEX IF NOT EXISTS idx_followers_following_id ON followers(following_id);
CREATE INDEX IF NOT EXISTS idx_followers_created_at ON followers(created_at);

-- ========================================
-- Étape 2: Activer Row Level Security
-- ========================================
ALTER TABLE followers ENABLE ROW LEVEL SECURITY;

-- ========================================
-- Étape 3: Créer les RLS Policies
-- ========================================

-- Supprimer les policies existantes (si elles existent)
DROP POLICY IF EXISTS "Les followers sont visibles par tous" ON followers;
DROP POLICY IF EXISTS "Les utilisateurs peuvent suivre d'autres" ON followers;
DROP POLICY IF EXISTS "Les utilisateurs peuvent se désabonner" ON followers;

-- Politique 1: Tout le monde peut voir qui suit qui
CREATE POLICY "Les followers sont visibles par tous" ON followers
    FOR SELECT USING (true);

-- Politique 2: Chacun peut suivre les autres
CREATE POLICY "Les utilisateurs peuvent suivre d'autres" ON followers
    FOR INSERT WITH CHECK (auth.uid() = follower_id);

-- Politique 3: Chacun peut se désabonner
CREATE POLICY "Les utilisateurs peuvent se désabonner" ON followers
    FOR DELETE USING (auth.uid() = follower_id);

-- ========================================
-- Étape 4: Créer les triggers automatiques
-- ========================================

-- Fonction qui met à jour le compteur followers_count
CREATE OR REPLACE FUNCTION update_followers_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        -- Quelqu'un suit un utilisateur → +1 abonné
        UPDATE users 
        SET followers_count = COALESCE(followers_count, 0) + 1 
        WHERE id = NEW.following_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        -- Quelqu'un arrête de suivre → -1 abonné
        UPDATE users 
        SET followers_count = GREATEST(COALESCE(followers_count, 0) - 1, 0) 
        WHERE id = OLD.following_id;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Trigger qui exécute la fonction quand la table followers change
DROP TRIGGER IF EXISTS followers_count_update ON followers;
CREATE TRIGGER followers_count_update AFTER INSERT OR DELETE ON followers
    FOR EACH ROW EXECUTE FUNCTION update_followers_count();

-- ========================================
-- Étape 5: Vérifier/Ajouter la colonne sur users
-- ========================================
-- (Cette colonne devrait déjà exister si vous avez exécuté monetization-schema.sql)

ALTER TABLE users ADD COLUMN IF NOT EXISTS followers_count INTEGER DEFAULT 0;

-- ========================================
-- VÉRIFICATION: Le script a réussi si vous voyez:
-- "Query succeeded: NNN rows affected"
-- ========================================
-- 
-- PROCHAINES ÉTAPES:
-- 1. Rafraîchissez l'app web (Cmd/Ctrl + F5)
-- 2. Allez sur un profil
-- 3. Cliquez "S'abonner"
-- 4. Le compteur devrait augmenter de 1 ✓
--
-- PROBLÈME ENCORE?
-- - Vérifiez que vous voir la table 'followers' dans Table Editor
-- - Vérifiez que 'followers_count' existe dans la table 'users'
-- - Essayez Cmd/Ctrl+F5 pour rafraîchir le cache du navigateur
-- ========================================
