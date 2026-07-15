-- Migration: add media_urls column to content
-- Adds support for multiple media URLs per content item.
-- Run this against your Postgres / Supabase database.

BEGIN;

ALTER TABLE content
    ADD COLUMN IF NOT EXISTS media_urls TEXT[];

COMMIT;

-- Optional: Create a GIN index for faster queries on the array (uncomment to use)
-- CREATE INDEX IF NOT EXISTS idx_content_media_urls ON content USING GIN (media_urls);
