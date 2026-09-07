-- Web Push subscriptions used by the feed notification service.
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
    endpoint TEXT PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    keys JSONB,
    reminder_timezone TEXT DEFAULT 'UTC',
    reminder_enabled BOOLEAN DEFAULT TRUE,
    last_reminder_slot TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.push_subscriptions
    ADD COLUMN IF NOT EXISTS reminder_timezone TEXT DEFAULT 'UTC',
    ADD COLUMN IF NOT EXISTS reminder_enabled BOOLEAN DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS last_reminder_slot TEXT,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id
    ON public.push_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_reminder_enabled
    ON public.push_subscriptions(reminder_enabled);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service role manage push" ON public.push_subscriptions;
CREATE POLICY "service role manage push" ON public.push_subscriptions
    FOR ALL USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');