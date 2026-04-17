-- ========================================
-- Table des tokens de devices mobiles (FCM / APNs)
-- ========================================
CREATE TABLE IF NOT EXISTS device_push_tokens (
    token TEXT PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    platform TEXT NOT NULL CHECK (platform IN ('android','ios','other')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE device_push_tokens
    ADD COLUMN IF NOT EXISTS platform TEXT NOT NULL DEFAULT 'other';
ALTER TABLE device_push_tokens
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_device_push_tokens_user_id ON device_push_tokens(user_id);

-- RLS : seules les opérations service_role (backend) sont autorisées
ALTER TABLE device_push_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service role manage device tokens" ON device_push_tokens;
CREATE POLICY "service role manage device tokens" ON device_push_tokens
    FOR ALL USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');
