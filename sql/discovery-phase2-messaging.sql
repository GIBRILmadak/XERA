-- ========================================
-- PHASE 2: MESSAGERIE DIRECTE (DM)
-- ========================================
-- Objectif:
-- 1) Conversations privées 1:1
-- 2) Messages texte et média en temps réel
-- 3) RLS stricte (accès limité aux participants)
-- 4) Fonction utilitaire pour créer/récupérer une conversation

-- Conversations 1:1 (pair_key = "userA:userB" trié)
CREATE TABLE IF NOT EXISTS dm_conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    pair_key TEXT NOT NULL UNIQUE,
    last_message_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE dm_conversations
    ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE dm_conversations
    ADD COLUMN IF NOT EXISTS pair_key TEXT;
ALTER TABLE dm_conversations
    ADD COLUMN IF NOT EXISTS last_message_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE dm_conversations
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE dm_conversations
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Participants d'une conversation
CREATE TABLE IF NOT EXISTS dm_participants (
    conversation_id UUID NOT NULL REFERENCES dm_conversations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    last_read_at TIMESTAMPTZ DEFAULT NOW(),
    muted BOOLEAN DEFAULT FALSE,
    hidden_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (conversation_id, user_id)
);

ALTER TABLE dm_participants
    ADD COLUMN IF NOT EXISTS last_read_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE dm_participants
    ADD COLUMN IF NOT EXISTS muted BOOLEAN DEFAULT FALSE;
ALTER TABLE dm_participants
    ADD COLUMN IF NOT EXISTS hidden_at TIMESTAMPTZ;
ALTER TABLE dm_participants
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- Messages
CREATE TABLE IF NOT EXISTS dm_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES dm_conversations(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body TEXT,
    media_url TEXT,
    media_type TEXT,
    media_name TEXT,
    media_size_bytes BIGINT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    edited_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ,
    CONSTRAINT dm_messages_body_max_len CHECK (char_length(COALESCE(body, '')) <= 4000),
    CONSTRAINT dm_messages_media_type_valid CHECK (
        media_type IS NULL OR media_type IN ('image', 'video')
    ),
    CONSTRAINT dm_messages_content_required CHECK (
        char_length(trim(COALESCE(body, ''))) > 0
        OR media_url IS NOT NULL
    ),
    CONSTRAINT dm_messages_media_requires_type CHECK (
        media_url IS NULL OR media_type IS NOT NULL
    )
);

ALTER TABLE dm_messages
    ALTER COLUMN body DROP NOT NULL;
ALTER TABLE dm_messages
    ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;
ALTER TABLE dm_messages
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE dm_messages
    ADD COLUMN IF NOT EXISTS media_url TEXT;
ALTER TABLE dm_messages
    ADD COLUMN IF NOT EXISTS media_type TEXT;
ALTER TABLE dm_messages
    ADD COLUMN IF NOT EXISTS media_name TEXT;
ALTER TABLE dm_messages
    ADD COLUMN IF NOT EXISTS media_size_bytes BIGINT;
ALTER TABLE dm_messages
    DROP CONSTRAINT IF EXISTS dm_messages_body_not_empty;
ALTER TABLE dm_messages
    DROP CONSTRAINT IF EXISTS dm_messages_body_max_len;
ALTER TABLE dm_messages
    DROP CONSTRAINT IF EXISTS dm_messages_media_type_valid;
ALTER TABLE dm_messages
    DROP CONSTRAINT IF EXISTS dm_messages_content_required;
ALTER TABLE dm_messages
    DROP CONSTRAINT IF EXISTS dm_messages_media_requires_type;
ALTER TABLE dm_messages
    ADD CONSTRAINT dm_messages_body_max_len CHECK (char_length(COALESCE(body, '')) <= 4000);
ALTER TABLE dm_messages
    ADD CONSTRAINT dm_messages_media_type_valid CHECK (
        media_type IS NULL OR media_type IN ('image', 'video')
    );
ALTER TABLE dm_messages
    ADD CONSTRAINT dm_messages_content_required CHECK (
        char_length(trim(COALESCE(body, ''))) > 0
        OR media_url IS NOT NULL
    );
ALTER TABLE dm_messages
    ADD CONSTRAINT dm_messages_media_requires_type CHECK (
        media_url IS NULL OR media_type IS NOT NULL
    );

-- Utilisateurs bloqués (blocage DM 1:1)
CREATE TABLE IF NOT EXISTS user_blocks (
    blocker_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    blocked_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (blocker_id, blocked_user_id)
);

ALTER TABLE user_blocks
    ADD COLUMN IF NOT EXISTS blocker_id UUID REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE user_blocks
    ADD COLUMN IF NOT EXISTS blocked_user_id UUID REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE user_blocks
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'user_blocks_not_self'
    ) THEN
        ALTER TABLE user_blocks
            ADD CONSTRAINT user_blocks_not_self
            CHECK (blocker_id <> blocked_user_id);
    END IF;
END
$$;

-- Index
CREATE INDEX IF NOT EXISTS idx_dm_conversations_last_message_at
    ON dm_conversations(last_message_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_dm_conversations_pair_key
    ON dm_conversations(pair_key);
CREATE INDEX IF NOT EXISTS idx_dm_participants_user_id
    ON dm_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_dm_participants_user_hidden_at
    ON dm_participants(user_id, hidden_at);
CREATE INDEX IF NOT EXISTS idx_dm_messages_conversation_created_at
    ON dm_messages(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dm_messages_sender_id
    ON dm_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_user_blocks_blocked_user_id
    ON user_blocks(blocked_user_id);

-- Trigger: mise à jour des timestamps de conversation
CREATE OR REPLACE FUNCTION update_dm_conversation_on_message()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE dm_conversations
    SET
        last_message_at = NEW.created_at,
        updated_at = NOW()
    WHERE id = NEW.conversation_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_dm_messages_touch_conversation ON dm_messages;
CREATE TRIGGER trg_dm_messages_touch_conversation
AFTER INSERT ON dm_messages
FOR EACH ROW EXECUTE FUNCTION update_dm_conversation_on_message();

-- Helper: vrai statut de blocage DM (dans les 2 sens)
CREATE OR REPLACE FUNCTION is_dm_blocked_between(p_user_a UUID, p_user_b UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM user_blocks b
        WHERE (b.blocker_id = p_user_a AND b.blocked_user_id = p_user_b)
           OR (b.blocker_id = p_user_b AND b.blocked_user_id = p_user_a)
    );
$$;

-- Helper: statut détaillé pour l'UI
CREATE OR REPLACE FUNCTION get_dm_relationship_status(p_other_user_id UUID)
RETURNS TABLE (
    blocked_by_me BOOLEAN,
    blocked_me BOOLEAN,
    can_message BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
    v_me UUID := auth.uid();
BEGIN
    IF v_me IS NULL THEN
        RAISE EXCEPTION 'NOT_AUTHENTICATED';
    END IF;

    IF p_other_user_id IS NULL THEN
        RAISE EXCEPTION 'OTHER_USER_REQUIRED';
    END IF;

    blocked_by_me := EXISTS (
        SELECT 1
        FROM user_blocks b
        WHERE b.blocker_id = v_me
          AND b.blocked_user_id = p_other_user_id
    );

    blocked_me := EXISTS (
        SELECT 1
        FROM user_blocks b
        WHERE b.blocker_id = p_other_user_id
          AND b.blocked_user_id = v_me
    );

    can_message := NOT blocked_by_me AND NOT blocked_me;
    RETURN NEXT;
END;
$$;

-- Suppression locale d'une discussion: on la masque seulement pour l'utilisateur courant
CREATE OR REPLACE FUNCTION hide_dm_conversation(p_conversation_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_me UUID := auth.uid();
BEGIN
    IF v_me IS NULL THEN
        RAISE EXCEPTION 'NOT_AUTHENTICATED';
    END IF;

    IF p_conversation_id IS NULL THEN
        RAISE EXCEPTION 'CONVERSATION_REQUIRED';
    END IF;

    UPDATE dm_participants
    SET hidden_at = NOW()
    WHERE conversation_id = p_conversation_id
      AND user_id = v_me;

    RETURN FOUND;
END;
$$;

-- Blocage DM + masquage local de la discussion éventuelle
CREATE OR REPLACE FUNCTION block_dm_user(p_other_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_me UUID := auth.uid();
    v_pair_key TEXT;
    v_conversation_id UUID;
BEGIN
    IF v_me IS NULL THEN
        RAISE EXCEPTION 'NOT_AUTHENTICATED';
    END IF;

    IF p_other_user_id IS NULL THEN
        RAISE EXCEPTION 'OTHER_USER_REQUIRED';
    END IF;

    IF p_other_user_id = v_me THEN
        RAISE EXCEPTION 'SELF_BLOCK_NOT_ALLOWED';
    END IF;

    INSERT INTO user_blocks (blocker_id, blocked_user_id, created_at)
    VALUES (v_me, p_other_user_id, NOW())
    ON CONFLICT (blocker_id, blocked_user_id) DO NOTHING;

    v_pair_key :=
        CASE
            WHEN v_me::TEXT < p_other_user_id::TEXT
                THEN v_me::TEXT || ':' || p_other_user_id::TEXT
            ELSE p_other_user_id::TEXT || ':' || v_me::TEXT
        END;

    SELECT c.id
    INTO v_conversation_id
    FROM dm_conversations c
    WHERE c.pair_key = v_pair_key
    LIMIT 1;

    IF v_conversation_id IS NOT NULL THEN
        UPDATE dm_participants
        SET hidden_at = NOW()
        WHERE conversation_id = v_conversation_id
          AND user_id = v_me;
    END IF;

    RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION unblock_dm_user(p_other_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_me UUID := auth.uid();
BEGIN
    IF v_me IS NULL THEN
        RAISE EXCEPTION 'NOT_AUTHENTICATED';
    END IF;

    IF p_other_user_id IS NULL THEN
        RAISE EXCEPTION 'OTHER_USER_REQUIRED';
    END IF;

    DELETE FROM user_blocks
    WHERE blocker_id = v_me
      AND blocked_user_id = p_other_user_id;

    RETURN FOUND;
END;
$$;

-- RLS
ALTER TABLE dm_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE dm_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE dm_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_blocks ENABLE ROW LEVEL SECURITY;

-- Nettoyage policies existantes (idempotence)
DROP POLICY IF EXISTS "dm_conversations_select_participants" ON dm_conversations;
DROP POLICY IF EXISTS "dm_conversations_insert_self" ON dm_conversations;
DROP POLICY IF EXISTS "dm_conversations_update_participants" ON dm_conversations;

DROP POLICY IF EXISTS "dm_participants_select_self" ON dm_participants;
DROP POLICY IF EXISTS "dm_participants_insert_self" ON dm_participants;
DROP POLICY IF EXISTS "dm_participants_update_self" ON dm_participants;

DROP POLICY IF EXISTS "dm_messages_select_participants" ON dm_messages;
DROP POLICY IF EXISTS "dm_messages_insert_sender_member" ON dm_messages;

DROP POLICY IF EXISTS "user_blocks_select_self" ON user_blocks;
DROP POLICY IF EXISTS "user_blocks_insert_self" ON user_blocks;
DROP POLICY IF EXISTS "user_blocks_delete_self" ON user_blocks;

-- Conversations visibles uniquement pour les participants
CREATE POLICY "dm_conversations_select_participants"
ON dm_conversations
FOR SELECT
USING (
    EXISTS (
        SELECT 1
        FROM dm_participants p
        WHERE p.conversation_id = dm_conversations.id
          AND p.user_id = auth.uid()
    )
);

-- Création conversation uniquement par l'utilisateur connecté
CREATE POLICY "dm_conversations_insert_self"
ON dm_conversations
FOR INSERT
WITH CHECK (created_by = auth.uid());

-- Mise à jour conversation uniquement par un participant
CREATE POLICY "dm_conversations_update_participants"
ON dm_conversations
FOR UPDATE
USING (
    EXISTS (
        SELECT 1
        FROM dm_participants p
        WHERE p.conversation_id = dm_conversations.id
          AND p.user_id = auth.uid()
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM dm_participants p
        WHERE p.conversation_id = dm_conversations.id
          AND p.user_id = auth.uid()
    )
);

-- Participants: un utilisateur peut lire uniquement sa propre ligne
CREATE POLICY "dm_participants_select_self"
ON dm_participants
FOR SELECT
USING (user_id = auth.uid());

-- Un utilisateur peut s'ajouter lui-même (fallback sans RPC)
CREATE POLICY "dm_participants_insert_self"
ON dm_participants
FOR INSERT
WITH CHECK (user_id = auth.uid());

-- Un utilisateur peut mettre à jour uniquement sa ligne (read/muted)
CREATE POLICY "dm_participants_update_self"
ON dm_participants
FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Messages visibles seulement pour les participants
CREATE POLICY "dm_messages_select_participants"
ON dm_messages
FOR SELECT
USING (
    EXISTS (
        SELECT 1
        FROM dm_participants p
        WHERE p.conversation_id = dm_messages.conversation_id
          AND p.user_id = auth.uid()
    )
);

-- Envoi message: sender doit être membre de la conversation
CREATE POLICY "dm_messages_insert_sender_member"
ON dm_messages
FOR INSERT
WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
        SELECT 1
        FROM dm_participants p
        WHERE p.conversation_id = dm_messages.conversation_id
          AND p.user_id = auth.uid()
    )
    AND NOT EXISTS (
        SELECT 1
        FROM dm_participants p
        WHERE p.conversation_id = dm_messages.conversation_id
          AND p.user_id <> auth.uid()
          AND public.is_dm_blocked_between(auth.uid(), p.user_id)
    )
);

-- Blocages: un utilisateur gère uniquement sa propre liste
CREATE POLICY "user_blocks_select_self"
ON user_blocks
FOR SELECT
USING (blocker_id = auth.uid());

CREATE POLICY "user_blocks_insert_self"
ON user_blocks
FOR INSERT
WITH CHECK (
    blocker_id = auth.uid()
    AND blocked_user_id IS NOT NULL
    AND blocked_user_id <> auth.uid()
);

CREATE POLICY "user_blocks_delete_self"
ON user_blocks
FOR DELETE
USING (blocker_id = auth.uid());

-- Fonction utilitaire: récupérer ou créer une conversation 1:1
CREATE OR REPLACE FUNCTION get_or_create_dm_conversation(p_other_user_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_me UUID := auth.uid();
    v_pair_key TEXT;
    v_conversation_id UUID;
BEGIN
    IF v_me IS NULL THEN
        RAISE EXCEPTION 'NOT_AUTHENTICATED';
    END IF;

    IF p_other_user_id IS NULL THEN
        RAISE EXCEPTION 'OTHER_USER_REQUIRED';
    END IF;

    IF p_other_user_id = v_me THEN
        RAISE EXCEPTION 'SELF_CONVERSATION_NOT_ALLOWED';
    END IF;

    IF public.is_dm_blocked_between(v_me, p_other_user_id) THEN
        RAISE EXCEPTION 'DM_BLOCKED';
    END IF;

    v_pair_key :=
        CASE
            WHEN v_me::TEXT < p_other_user_id::TEXT
                THEN v_me::TEXT || ':' || p_other_user_id::TEXT
            ELSE p_other_user_id::TEXT || ':' || v_me::TEXT
        END;

    SELECT c.id
    INTO v_conversation_id
    FROM dm_conversations c
    WHERE c.pair_key = v_pair_key
    LIMIT 1;

    IF v_conversation_id IS NULL THEN
        INSERT INTO dm_conversations (created_by, pair_key, last_message_at)
        VALUES (v_me, v_pair_key, NOW())
        RETURNING id INTO v_conversation_id;
    END IF;

    INSERT INTO dm_participants (conversation_id, user_id, last_read_at, hidden_at)
    VALUES (v_conversation_id, v_me, NOW(), NULL)
    ON CONFLICT (conversation_id, user_id) DO UPDATE
    SET
        last_read_at = EXCLUDED.last_read_at,
        hidden_at = NULL;

    INSERT INTO dm_participants (conversation_id, user_id, last_read_at)
    VALUES (v_conversation_id, p_other_user_id, NOW())
    ON CONFLICT (conversation_id, user_id) DO NOTHING;

    RETURN v_conversation_id;
END;
$$;

REVOKE ALL ON FUNCTION is_dm_blocked_between(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION is_dm_blocked_between(UUID, UUID) TO authenticated;
REVOKE ALL ON FUNCTION get_dm_relationship_status(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_dm_relationship_status(UUID) TO authenticated;
REVOKE ALL ON FUNCTION hide_dm_conversation(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hide_dm_conversation(UUID) TO authenticated;
REVOKE ALL ON FUNCTION block_dm_user(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION block_dm_user(UUID) TO authenticated;
REVOKE ALL ON FUNCTION unblock_dm_user(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION unblock_dm_user(UUID) TO authenticated;
REVOKE ALL ON FUNCTION get_or_create_dm_conversation(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_or_create_dm_conversation(UUID) TO authenticated;

-- Realtime: s'assurer que les tables DM publient des événements
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_publication
        WHERE pubname = 'supabase_realtime'
    ) THEN
        IF NOT EXISTS (
            SELECT 1
            FROM pg_publication_tables
            WHERE pubname = 'supabase_realtime'
              AND schemaname = 'public'
              AND tablename = 'dm_messages'
        ) THEN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.dm_messages;
        END IF;

        IF NOT EXISTS (
            SELECT 1
            FROM pg_publication_tables
            WHERE pubname = 'supabase_realtime'
              AND schemaname = 'public'
              AND tablename = 'dm_participants'
        ) THEN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.dm_participants;
        END IF;
    END IF;
END
$$;

-- Notes:
-- - Le push est géré côté backend (relay sur table dm_messages).
-- - Le lien push cible index.html?messages=1&dm=<sender_id>.
-- - "Supprimer une discussion" masque localement la conversation (hidden_at),
--   sans effacer les messages chez l'autre utilisateur.
