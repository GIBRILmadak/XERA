-- ========================================
-- PHASE 2: MESSAGERIE DIRECTE (DM)
-- ========================================
-- Objectif:
-- 1) Conversations privées 1:1
-- 2) Messages texte en temps réel
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
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (conversation_id, user_id)
);

ALTER TABLE dm_participants
    ADD COLUMN IF NOT EXISTS last_read_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE dm_participants
    ADD COLUMN IF NOT EXISTS muted BOOLEAN DEFAULT FALSE;
ALTER TABLE dm_participants
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- Messages
CREATE TABLE IF NOT EXISTS dm_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES dm_conversations(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    edited_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ,
    CONSTRAINT dm_messages_body_not_empty CHECK (char_length(trim(body)) > 0),
    CONSTRAINT dm_messages_body_max_len CHECK (char_length(body) <= 4000)
);

ALTER TABLE dm_messages
    ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;
ALTER TABLE dm_messages
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Index
CREATE INDEX IF NOT EXISTS idx_dm_conversations_last_message_at
    ON dm_conversations(last_message_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_dm_conversations_pair_key
    ON dm_conversations(pair_key);
CREATE INDEX IF NOT EXISTS idx_dm_participants_user_id
    ON dm_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_dm_messages_conversation_created_at
    ON dm_messages(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dm_messages_sender_id
    ON dm_messages(sender_id);

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

-- RLS
ALTER TABLE dm_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE dm_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE dm_messages ENABLE ROW LEVEL SECURITY;

-- Nettoyage policies existantes (idempotence)
DROP POLICY IF EXISTS "dm_conversations_select_participants" ON dm_conversations;
DROP POLICY IF EXISTS "dm_conversations_insert_self" ON dm_conversations;
DROP POLICY IF EXISTS "dm_conversations_update_participants" ON dm_conversations;

DROP POLICY IF EXISTS "dm_participants_select_self" ON dm_participants;
DROP POLICY IF EXISTS "dm_participants_insert_self" ON dm_participants;
DROP POLICY IF EXISTS "dm_participants_update_self" ON dm_participants;

DROP POLICY IF EXISTS "dm_messages_select_participants" ON dm_messages;
DROP POLICY IF EXISTS "dm_messages_insert_sender_member" ON dm_messages;

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
);

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

    INSERT INTO dm_participants (conversation_id, user_id, last_read_at)
    VALUES
        (v_conversation_id, v_me, NOW()),
        (v_conversation_id, p_other_user_id, NOW())
    ON CONFLICT (conversation_id, user_id) DO NOTHING;

    RETURN v_conversation_id;
END;
$$;

REVOKE ALL ON FUNCTION get_or_create_dm_conversation(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_or_create_dm_conversation(UUID) TO authenticated;

-- Notes:
-- - Le push est géré côté backend (relay sur table dm_messages).
-- - Le lien push cible index.html?messages=1&dm=<sender_id>.
