-- ========================================
-- PHASE 1: TYPE DE COMPTE + METADONNEES ARC
-- ========================================
-- Objectif:
-- 1) Type de compte Discovery (fan / recruiter / investor)
-- 2) Niveau ARC (idee/prototype/demo/beta/release)
-- 3) Intentions d'opportunite ARC (cherche_collab / cherche_investissement / open_to_recruit)

-- Users: role discovery
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS account_subtype TEXT;

-- Normalisation basique des anciennes valeurs
UPDATE users
SET account_subtype = 'recruiter'
WHERE LOWER(COALESCE(account_subtype, '')) = 'recruteur';

UPDATE users
SET account_subtype = 'investor'
WHERE LOWER(COALESCE(account_subtype, '')) = 'investisseur';

UPDATE users
SET account_subtype = 'fan'
WHERE COALESCE(TRIM(account_subtype), '') = '';

-- ARCs: niveau + intentions
ALTER TABLE arcs
    ADD COLUMN IF NOT EXISTS stage_level TEXT DEFAULT 'idee';

ALTER TABLE arcs
    ADD COLUMN IF NOT EXISTS opportunity_intents TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Normalisation defensive
UPDATE arcs
SET stage_level = 'idee'
WHERE COALESCE(TRIM(stage_level), '') = '' OR LOWER(stage_level) = 'idea';

UPDATE arcs
SET opportunity_intents = ARRAY[]::TEXT[]
WHERE opportunity_intents IS NULL;

-- Index pour filtres/recherche futurs
CREATE INDEX IF NOT EXISTS idx_arcs_stage_level ON arcs(stage_level);
CREATE INDEX IF NOT EXISTS idx_arcs_opportunity_intents ON arcs USING GIN(opportunity_intents);
CREATE INDEX IF NOT EXISTS idx_users_account_subtype ON users(account_subtype);

-- Notes:
-- - Laissez opportunity_intents vide pour un partage public sans ciblage.
-- - Les validations applicatives sont faites côté frontend pour limiter les regressions.
