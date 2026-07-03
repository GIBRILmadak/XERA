-- ========================================
-- SCHÉMA POUR LES ARCS (XERA)
-- ========================================

-- Table des ARCs
CREATE TABLE IF NOT EXISTS arcs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    goal TEXT, -- Objectif final
    start_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    end_date TIMESTAMP WITH TIME ZONE,
    duration_days INTEGER,
    status TEXT NOT NULL CHECK (status IN ('in_progress', 'completed', 'abandoned')) DEFAULT 'in_progress',
    media_url TEXT, -- URL de l'image ou vidéo de couverture
    media_type TEXT CHECK (media_type IN ('image', 'video')) DEFAULT 'image',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Ajouter la référence d'ARC aux contenus (posts)
-- Si la colonne existe déjà, cette commande sera ignorée ou échouera selon le SGBD, 
-- mais pour Supabase/Postgres on peut utiliser DO block ou juste l'ajouter si on sait qu'elle n'y est pas.
ALTER TABLE content ADD COLUMN IF NOT EXISTS arc_id UUID REFERENCES arcs(id) ON DELETE SET NULL;

-- Table pour suivre des ARCs spécifiques
CREATE TABLE IF NOT EXISTS arc_followers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, -- L'utilisateur qui suit
    arc_id UUID NOT NULL REFERENCES arcs(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, arc_id)
);

-- Table pour les collaborations d'ARCs
CREATE TABLE IF NOT EXISTS arc_collaborations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    arc_id UUID NOT NULL REFERENCES arcs(id) ON DELETE CASCADE,
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    collaborator_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'declined', 'left')) DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(arc_id, collaborator_id)
);

-- Index pour les performances
CREATE INDEX IF NOT EXISTS idx_arcs_user_id ON arcs(user_id);
CREATE INDEX IF NOT EXISTS idx_content_arc_id ON content(arc_id);
CREATE INDEX IF NOT EXISTS idx_arc_followers_user_id ON arc_followers(user_id);
CREATE INDEX IF NOT EXISTS idx_arc_followers_arc_id ON arc_followers(arc_id);
CREATE INDEX IF NOT EXISTS idx_arc_collaborations_arc_id ON arc_collaborations(arc_id);
CREATE INDEX IF NOT EXISTS idx_arc_collaborations_owner_id ON arc_collaborations(owner_id);
CREATE INDEX IF NOT EXISTS idx_arc_collaborations_collaborator_id ON arc_collaborations(collaborator_id);
CREATE INDEX IF NOT EXISTS idx_arc_collaborations_status ON arc_collaborations(status);

-- RLS Policies pour ARCs

ALTER TABLE arcs ENABLE ROW LEVEL SECURITY;
ALTER TABLE arc_followers ENABLE ROW LEVEL SECURITY;
ALTER TABLE arc_collaborations ENABLE ROW LEVEL SECURITY;

-- Policies ARCs
CREATE POLICY "Les ARCs publics sont visibles par tous" ON arcs
    FOR SELECT USING (true);

CREATE POLICY "Les utilisateurs peuvent créer leurs propres ARCs" ON arcs
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Les utilisateurs peuvent mettre à jour leurs propres ARCs" ON arcs
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Les utilisateurs peuvent supprimer leurs propres ARCs" ON arcs
    FOR DELETE USING (auth.uid() = user_id);

-- Policies ARC Followers
CREATE POLICY "Les followers d'ARC sont visibles par tous" ON arc_followers
    FOR SELECT USING (true);

CREATE POLICY "Les utilisateurs peuvent suivre des ARCs" ON arc_followers
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Les utilisateurs peuvent ne plus suivre des ARCs" ON arc_followers
    FOR DELETE USING (auth.uid() = user_id);

-- Policies ARC Collaborations
CREATE POLICY "Les collaborations d'ARC sont visibles par tous" ON arc_collaborations
    FOR SELECT USING (true);

CREATE POLICY "Les utilisateurs peuvent demander une collaboration" ON arc_collaborations
    FOR INSERT WITH CHECK (auth.uid() = collaborator_id);

CREATE POLICY "Les propriétaires et collaborateurs peuvent gérer la collaboration" ON arc_collaborations
    FOR UPDATE USING (auth.uid() = owner_id OR auth.uid() = collaborator_id)
    WITH CHECK (auth.uid() = owner_id OR auth.uid() = collaborator_id);

CREATE POLICY "Les utilisateurs peuvent quitter une collaboration" ON arc_collaborations
    FOR DELETE USING (auth.uid() = owner_id OR auth.uid() = collaborator_id);

-- Trigger pour updated_at sur arcs
CREATE TRIGGER update_arcs_updated_at BEFORE UPDATE ON arcs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Trigger pour updated_at sur arc_collaborations
CREATE TRIGGER update_arc_collaborations_updated_at BEFORE UPDATE ON arc_collaborations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
