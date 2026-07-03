-- ================================================================
-- SYSTEME DE PAGES PROFESSIONNELLES ET CERTIFICATIONS (STYLE LINKEDIN)
-- ================================================================

-- 1. Table des Pages Professionnelles
-- Permet aux comptes personnels de créer et gérer des entités pro (entreprises, écoles, orgs)
CREATE TABLE IF NOT EXISTS professional_pages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    bio TEXT,
    description TEXT,
    avatar_url TEXT,
    banner_url TEXT,
    industry TEXT,
    location TEXT,
    website_url TEXT,
    social_links JSONB DEFAULT '{}'::JSONB,

    -- Momentum Engine Signals
    hiring_needs TEXT[] DEFAULT ARRAY[]::TEXT[],
    talent_interests TEXT[] DEFAULT ARRAY[]::TEXT[], -- ex: ["React", "AI", "Design"]

    is_verified BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index pour la recherche et le slug
CREATE INDEX IF NOT EXISTS idx_pro_pages_owner ON professional_pages(owner_id);
CREATE INDEX IF NOT EXISTS idx_pro_pages_slug ON professional_pages(slug);
CREATE INDEX IF NOT EXISTS idx_pro_pages_industry ON professional_pages(industry);
CREATE INDEX IF NOT EXISTS idx_pro_pages_hiring_needs ON professional_pages USING GIN(hiring_needs);

-- 2. Table des Certifications (Affiliations)
-- Permet aux pages pro de certifier des utilisateurs comme employés, étudiants, etc.
CREATE TABLE IF NOT EXISTS professional_certifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    page_id UUID NOT NULL REFERENCES professional_pages(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    type TEXT NOT NULL CHECK (type IN ('employee', 'student', 'partner', 'alumni', 'contractor')),
    title TEXT, -- ex: "Senior Developer"
    department TEXT,

    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'expired', 'revoked')),
    start_date DATE,
    end_date DATE,

    metadata JSONB DEFAULT '{}'::JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Unicité pour éviter les doublons de certification active du même type
    UNIQUE(page_id, user_id, type)
);

-- Index pour les certifications
CREATE INDEX IF NOT EXISTS idx_cert_page ON professional_certifications(page_id);
CREATE INDEX IF NOT EXISTS idx_cert_user ON professional_certifications(user_id);
CREATE INDEX IF NOT EXISTS idx_cert_status ON professional_certifications(status);

-- 3. Migration des anciens comptes "Enterprise"
-- Si un utilisateur était de type "enterprise", on peut lui créer automatiquement une page pro
-- ou simplement mettre à jour son subtype pour la transition.

-- Mise à jour du subtype 'enterprise' vers 'professional' dans la table users
UPDATE users
SET account_subtype = 'professional'
WHERE account_subtype = 'enterprise';

-- On s'assure que le subtype 'professional' est autorisé ou reconnu
-- (Note: Selon la structure actuelle, c'est du TEXT libre donc pas de contrainte stricte à modifier ici)

-- 4. RLS POLICIES
ALTER TABLE professional_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE professional_certifications ENABLE ROW LEVEL SECURITY;

-- Pages: Tout le monde peut voir, seul le proprio peut modifier
CREATE POLICY "Pro pages are viewable by everyone" ON professional_pages
    FOR SELECT USING (true);

CREATE POLICY "Owners can manage their pro pages" ON professional_pages
    FOR ALL USING (auth.uid() = owner_id);

-- Certifications: Tout le monde peut voir les actives, seul le proprio de la page peut certifier
CREATE POLICY "Certifications are viewable by everyone" ON professional_certifications
    FOR SELECT USING (status = 'active');

CREATE POLICY "Page owners can manage certifications" ON professional_certifications
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM professional_pages
            WHERE id = professional_certifications.page_id
            AND owner_id = auth.uid()
        )
    );

-- Les utilisateurs peuvent voir leurs propres certifications même si pas actives
CREATE POLICY "Users can view their own certifications" ON professional_certifications
    FOR SELECT USING (auth.uid() = user_id);

-- 5. Momentum Engine Integration (Helper View)
-- Vue pour aider le Momentum Engine à trouver les besoins des entreprises
CREATE OR REPLACE VIEW enterprise_talent_needs AS
SELECT
    p.id as page_id,
    p.owner_id,
    p.name as company_name,
    p.hiring_needs,
    p.talent_interests,
    u.id as user_id -- link back to owner user for feed targeting
FROM professional_pages p
JOIN users u ON p.owner_id = u.id;

-- 6. Extension de la table content pour les publications de pages
ALTER TABLE content ADD COLUMN IF NOT EXISTS page_id UUID REFERENCES professional_pages(id) ON DELETE CASCADE;
ALTER TABLE content ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::JSONB; -- Pour stocker dates d'événements, etc.
CREATE INDEX IF NOT EXISTS idx_content_page ON content(page_id);

-- Mise à jour RLS pour permettre aux proprios de pages de poster
CREATE POLICY "Page owners can post content" ON content
    FOR INSERT WITH CHECK (
        auth.uid() = user_id OR
        EXISTS (
            SELECT 1 FROM professional_pages
            WHERE id = page_id AND owner_id = auth.uid()
        )
    );

CREATE POLICY "Page owners can update their page content" ON content
    FOR UPDATE USING (
        auth.uid() = user_id OR
        EXISTS (
            SELECT 1 FROM professional_pages
            WHERE id = page_id AND owner_id = auth.uid()
        )
    );
