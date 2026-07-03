-- ================================================================
-- MISE À JOUR : ARCS D'ORGANISATION ET VALIDATION PRO
-- ================================================================

-- 1. Extension des ARCs pour supporter les Pages Professionnelles
ALTER TABLE arcs ADD COLUMN IF NOT EXISTS page_id UUID REFERENCES professional_pages(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_arcs_page_id ON arcs(page_id);

-- Mise à jour RLS pour les ARCs de pages
DROP POLICY IF EXISTS "Owners of pro pages can manage their page ARCs" ON arcs;
CREATE POLICY "Owners of pro pages can manage their page ARCs" ON arcs
    FOR ALL USING (
        auth.uid() = user_id OR
        EXISTS (
            SELECT 1 FROM professional_pages
            WHERE id = arcs.page_id AND owner_id = auth.uid()
        )
    );

-- 2. Système de Validation Pro (Seal of Approval)
ALTER TABLE content ADD COLUMN IF NOT EXISTS is_validated_pro BOOLEAN DEFAULT false;
ALTER TABLE content ADD COLUMN IF NOT EXISTS validated_by_page_id UUID REFERENCES professional_pages(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_content_validated_pro ON content(is_validated_pro) WHERE is_validated_pro = true;

-- Mise à jour RLS pour la validation par les pages pro
-- On permet aux propriétaires de pages de mettre à jour la validation d'un contenu
DROP POLICY IF EXISTS "Page owners can validate content" ON content;
CREATE POLICY "Page owners can validate content" ON content
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM professional_pages
            WHERE owner_id = auth.uid()
            -- L'entreprise ne peut valider que si le contenu appartient à un de ses membres certifiés
            AND id IN (
                SELECT page_id FROM professional_certifications
                WHERE user_id = content.user_id AND status = 'active'
            )
        )
    );

-- 3. Vue Momentum pour les ARCs d'organisation
CREATE OR REPLACE VIEW organization_arcs_pulse AS
SELECT
    p.id as page_id,
    p.name as organization_name,
    a.id as arc_id,
    a.title as arc_title,
    a.status as arc_status,
    a.created_at,
    (SELECT count(*) FROM content c WHERE c.arc_id = a.id) as update_count
FROM professional_pages p
JOIN arcs a ON a.page_id = p.id;


1. Job ARCs (Recrutement par la Trajectoire)
Oublions les offres d'emploi statiques.
•
L'idée : L'entreprise publie un poste sous forme de trajectoire attendue : "Voici ce que notre futur Lead Dev accomplira les 3 premiers mois".
•
Le Signal : Les candidats peuvent "postuler" en liant leur propre ARC au projet de l'entreprise. Le Momentum Engine fait le match entre les deux trajectoires.
2. Le Talent Pipeline (Privé)
•
L'idée : Un tableau de bord pour la page pro où elle peut "Bookmarker" des talents repérés dans le Discover.
•
Le Signal : Une liste de profils dont le Momentum est compatible avec les talent_interests de la page.
3. Analytics de Marque (Le "Pulse" Pro)
•
L'idée : Un dashboard qui montre :
◦
La portée cumulée (Reach) de l'entreprise + de tous ses employés certifiés.
◦
Quels secteurs d'activité s'intéressent le plus à la page.
◦
L'évolution du score d'attractivité de la marque sur XERA.
7. Mode "Showcase" pour les Écoles/Incubateurs
•
L'idée : Un onglet spécial pour afficher non pas des employés, mais des "Projets Incubés" ou des "Alumni Stars".
•
Le Signal : Valoriser le succès des membres pour prouver la qualité de l'accompagnement de l'organisation.