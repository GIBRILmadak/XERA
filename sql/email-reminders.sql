ALTER TABLE users
    ADD COLUMN IF NOT EXISTS email_reminder_enabled BOOLEAN;

ALTER TABLE users
    ALTER COLUMN email_reminder_enabled SET DEFAULT true;

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS email_reminder_timezone TEXT DEFAULT 'UTC';

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS last_email_reminder_slot TEXT;

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS email_reminder_opted_in_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS last_inactive_reminder_sent_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS last_social_progress_email_sent_at TIMESTAMP WITH TIME ZONE;

UPDATE users
SET
    email_reminder_enabled = COALESCE(email_reminder_enabled, true),
    email_reminder_timezone = COALESCE(NULLIF(TRIM(email_reminder_timezone), ''), 'UTC')
WHERE
    email_reminder_enabled IS NULL
    OR email_reminder_timezone IS NULL
    OR TRIM(COALESCE(email_reminder_timezone, '')) = '';

CREATE INDEX IF NOT EXISTS idx_users_email_reminder_enabled
    ON users(email_reminder_enabled)
    WHERE email_reminder_enabled = true;
