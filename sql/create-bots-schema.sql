-- Schema pour les bots seed
-- Ajoute le flag is_bot sur users, table bots et table de contrôle bot_control

-- Ajouter la colonne is_bot sur users
ALTER TABLE IF EXISTS users
ADD COLUMN IF NOT EXISTS is_bot boolean DEFAULT false;

-- Table bots
CREATE TABLE IF NOT EXISTS bots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  display_name text,
  avatar_url text,
  active boolean DEFAULT false,
  schedule_hour smallint,
  encourage_days int[], -- jours de la semaine 0=dim,6=sam
  last_posted_at timestamptz,
  last_encouraged_at timestamptz,
  last_action_at timestamptz,
  meta jsonb DEFAULT '{}'::jsonb
);

-- Table de contrôle pour paramètres globaux (ex: active_count)
CREATE TABLE IF NOT EXISTS bot_control (
  key text PRIMARY KEY,
  value jsonb,
  updated_at timestamptz DEFAULT now()
);

-- Valeur par défaut pour le nombre de bots actifs
INSERT INTO bot_control (key, value) VALUES ('bots.active_count', '{"count":0}')
ON CONFLICT (key) DO UPDATE SET value = bot_control.value;
