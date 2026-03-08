-- Correctifs RLS pour les notifications (live streaming)
-- Exécuter dans le dashboard SQL Supabase

-- 1) Étendre la liste des types autorisés
ALTER TABLE notifications
    DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE notifications
    ADD CONSTRAINT notifications_type_check
    CHECK (type IN ('follow','like','comment','mention','achievement','stream'));

-- 2) Politique INSERT pour laisser passer les triggers de stream/follow
DROP POLICY IF EXISTS "Les utilisateurs peuvent créer des notifications" ON notifications;
CREATE POLICY "Les utilisateurs peuvent créer des notifications" ON notifications
    FOR INSERT
    WITH CHECK (
        auth.uid() = user_id
        OR EXISTS (
            SELECT 1 FROM followers f
            WHERE f.following_id = auth.uid()
              AND f.follower_id = user_id
        )
        OR EXISTS (
            SELECT 1 FROM followers f
            WHERE f.follower_id = auth.uid()
              AND f.following_id = user_id
        )
        OR auth.role() = 'service_role'
    );

