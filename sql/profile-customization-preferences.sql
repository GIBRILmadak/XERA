-- Profile customization preferences for XERA profiles.
-- Stores appearance and privacy choices in one forward-compatible JSON object.

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS profile_preferences JSONB;

ALTER TABLE users
    ALTER COLUMN profile_preferences SET DEFAULT '{
        "appearance": {
            "theme": "xera",
            "accent": "#10b981",
            "secondary": "#f59e0b",
            "layout": "balanced",
            "bannerStyle": "cover",
            "panelStyle": "glass"
        },
        "privacy": {
            "visibility": "public",
            "discoverable": true,
            "showStats": true,
            "showSocials": true,
            "showActivity": true,
            "allowMessages": "everyone"
        }
    }'::jsonb;

UPDATE users
SET profile_preferences = jsonb_strip_nulls(
    jsonb_build_object(
        'appearance',
        COALESCE(profile_preferences->'appearance', '{}'::jsonb),
        'privacy',
        COALESCE(profile_preferences->'privacy', '{}'::jsonb)
    )
)
WHERE profile_preferences IS NULL
   OR jsonb_typeof(profile_preferences) <> 'object'
   OR NOT (profile_preferences ? 'appearance')
   OR NOT (profile_preferences ? 'privacy');

ALTER TABLE users
    ALTER COLUMN profile_preferences SET NOT NULL;

ALTER TABLE users
    DROP CONSTRAINT IF EXISTS users_profile_preferences_object;

ALTER TABLE users
    ADD CONSTRAINT users_profile_preferences_object
    CHECK (jsonb_typeof(profile_preferences) = 'object');

CREATE INDEX IF NOT EXISTS idx_users_profile_preferences_gin
    ON users USING GIN (profile_preferences);
