-- ========================================
-- DIAGNOSTIQUER: Pourquoi l'app affiche 0?
-- ========================================
-- 
-- Ce diagnostic regarde les RLS policies
--

-- 1️⃣ VOIR LES RLS POLICIES SUR LA TABLE FOLLOWERS
-- Utiliser le catalogue pg_policy pour récupérer le nom et le type d'opération
SELECT
    p.polname AS "Nom de la policy",
    CASE p.polcmd
        WHEN 'r' THEN 'SELECT'
        WHEN 'a' THEN 'INSERT'
        WHEN 'd' THEN 'DELETE'
        WHEN 'u' THEN 'UPDATE'
        ELSE p.polcmd::text
    END AS "Opération",
    pg_get_expr(p.polqual, p.polrelid) AS "USING",
    pg_get_expr(p.polwithcheck, p.polrelid) AS "WITH_CHECK",
    'Vérifier si SELECT est autorisé' AS "Note"
FROM pg_catalog.pg_policy p
JOIN pg_class c ON c.oid = p.polrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'followers';

-- 2️⃣ VÉRIFIER SI RLS EST ACTIF
SELECT
    t.table_name,
    pg_table_is_visible(to_regclass(t.table_schema || '.' || t.table_name)) AS "visible",
    CASE WHEN pg_table_is_visible(to_regclass(t.table_schema || '.' || t.table_name))
        THEN 'True = table visible'
        ELSE 'False = table non visible (RLS ou search_path)'
    END AS "Note"
FROM information_schema.tables t
WHERE t.table_name = 'followers'
  AND t.table_type = 'BASE TABLE'
  AND t.table_schema = 'public';

-- 3️⃣ VOIR LA COLONNE followers_count DANS USERS
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'users' AND column_name = 'followers_count';

-- 4️⃣ TEST: Compter les followers en tant qu'utilisateur anonyme
-- (Cette requête peut échouer si RLS bloque)
SELECT COUNT(*) as "Followers comptés par un user anonyme"
FROM followers;
