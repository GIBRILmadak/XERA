-- ========================================
-- TABLE FOLLOWERS - Gestion des abonnements entre utilisateurs
-- ========================================

-- Table pour gérer les relations suivant/suivi entre utilisateurs
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

-- Activer Row Level Security
ALTER TABLE followers ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Les suivis d'un utilisateur sont visibles par tous
CREATE POLICY "Les followers sont visibles par tous" ON followers
    FOR SELECT USING (true);

-- Les utilisateurs peuvent ajouter un suiveur
CREATE POLICY "Les utilisateurs peuvent suivre d'autres" ON followers
    FOR INSERT WITH CHECK (auth.uid() = follower_id);

-- Les utilisateurs peuvent supprimer un suiveur
CREATE POLICY "Les utilisateurs peuvent se désabonner" ON followers
    FOR DELETE USING (auth.uid() = follower_id);

-- Trigger pour mettre à jour le compteur de followers
CREATE OR REPLACE FUNCTION update_followers_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE users SET followers_count = followers_count + 1 WHERE id = NEW.following_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE users SET followers_count = followers_count - 1 WHERE id = OLD.following_id;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Créer le trigger
DROP TRIGGER IF EXISTS followers_count_update ON followers;
CREATE TRIGGER followers_count_update AFTER INSERT OR DELETE ON followers
    FOR EACH ROW EXECUTE FUNCTION update_followers_count();
