-- Correctifs RLS pour les notifications (live streaming)
-- Exécuter dans le dashboard SQL Supabase

-- 1) Étendre la liste des types autorisés
ALTER TABLE notifications
    DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE notifications
    ADD CONSTRAINT notifications_type_check
    CHECK (type IN ('follow','like','comment','mention','achievement','stream','support','encouragement','arc_follow','new_arc','new_update','live_start','live_chat','collaboration','announcement_reply'));

-- 2) Politique INSERT pour laisser passer les triggers de stream/follow
DROP POLICY IF EXISTS "Les utilisateurs peuvent créer des notifications" ON notifications;
CREATE POLICY "Les utilisateurs peuvent créer des notifications" ON notifications
    FOR INSERT
    WITH CHECK (
        auth.uid() IS NOT NULL
        OR auth.role() = 'service_role'
    );
