-- ============================================================
-- FIX: ANOMALIE DES 31 ABONNÉS AUTOMATIQUES
-- ============================================================
-- Ce script réinitialise proprement tous les compteurs et
-- empêche l'injection de données fantômes.

-- 1. On s'assure que la colonne followers_count a une valeur par défaut de 0
ALTER TABLE users ALTER COLUMN followers_count SET DEFAULT 0;

-- 2. On réinitialise tous les compteurs à 0 pour tout le monde
UPDATE users SET followers_count = 0;

-- 3. On recalcule les VRAIS abonnés à partir de la table 'followers'
UPDATE users
SET followers_count = (
    SELECT COUNT(*)
    FROM followers
    WHERE followers.following_id = users.id
);

-- 4. Suppression de tout trigger suspect qui pourrait ajouter 31
-- On recrée le trigger sain et propre
CREATE OR REPLACE FUNCTION fix_followers_count_trigger()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE users SET followers_count = followers_count + 1 WHERE id = NEW.following_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE users SET followers_count = GREATEST(followers_count - 1, 0) WHERE id = OLD.following_id;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS followers_count_update ON followers;
CREATE TRIGGER followers_count_update
AFTER INSERT OR DELETE ON followers
FOR EACH ROW EXECUTE FUNCTION fix_followers_count_trigger();

-- FIN. Exécutez ce script dans l'éditeur SQL de Supabase.
