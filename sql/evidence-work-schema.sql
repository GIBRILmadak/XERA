-- Schéma de production pour Evidence of Work

CREATE TABLE IF NOT EXISTS oauth_states (
  state text PRIMARY KEY,
  user_id uuid NOT NULL,
  tool text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_oauth_tokens (
  user_id uuid NOT NULL,
  tool text NOT NULL,
  access_token_encrypted text,
  refresh_token_encrypted text,
  expires_at timestamptz,
  status text DEFAULT 'active',
  last_refresh_at timestamptz,
  inserted_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, tool)
);

CREATE TABLE IF NOT EXISTS ingestion_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  tool text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  payload jsonb,
  scheduled_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
