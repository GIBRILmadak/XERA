-- YouTube Shorts Anti-Cold Start System
-- Table: youtube_shorts
-- Purpose: Store YouTube Shorts videos for feed population

CREATE TABLE IF NOT EXISTS youtube_shorts (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  youtube_video_id TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  thumbnail_url TEXT,
  channel_title TEXT,
  channel_id TEXT,
  channel_logo_url TEXT,
  published_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  view_count INTEGER DEFAULT 0,
  like_count INTEGER DEFAULT 0,
  comment_count INTEGER DEFAULT 0,
  duration TEXT DEFAULT 'PT0S',
  language TEXT DEFAULT 'en',
  quality_score DECIMAL(10, 2) DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  fetched_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for optimal query performance
CREATE INDEX idx_youtube_shorts_quality_score ON youtube_shorts(quality_score DESC) WHERE is_active = true;
CREATE INDEX idx_youtube_shorts_published_at ON youtube_shorts(published_at DESC) WHERE is_active = true;
CREATE INDEX idx_youtube_shorts_view_count ON youtube_shorts(view_count DESC) WHERE is_active = true;
CREATE INDEX idx_youtube_shorts_is_active ON youtube_shorts(is_active);
CREATE INDEX idx_youtube_shorts_channel_id ON youtube_shorts(channel_id) WHERE is_active = true;
CREATE INDEX idx_youtube_shorts_language ON youtube_shorts(language) WHERE is_active = true;

-- Enable RLS (Row Level Security)
ALTER TABLE youtube_shorts ENABLE ROW LEVEL SECURITY;

-- Allow everyone to read active videos
CREATE POLICY "Allow public read of active videos" ON youtube_shorts
  FOR SELECT
  USING (is_active = true);

-- Allow authenticated users to read all videos
CREATE POLICY "Allow authenticated read" ON youtube_shorts
  FOR SELECT
  TO authenticated
  USING (true);

-- Authenticated users can manage YouTube shorts (backend API controlled)
CREATE POLICY "Allow authenticated insert" ON youtube_shorts
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow authenticated update" ON youtube_shorts
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow authenticated delete" ON youtube_shorts
  FOR DELETE
  TO authenticated
  USING (true);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_youtube_shorts_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER youtube_shorts_timestamp
BEFORE UPDATE ON youtube_shorts
FOR EACH ROW
EXECUTE FUNCTION update_youtube_shorts_timestamp();

-- View for admin monitoring
CREATE OR REPLACE VIEW youtube_shorts_analytics AS
SELECT
  COUNT(*) as total_videos,
  COUNT(CASE WHEN is_active THEN 1 END) as active_videos,
  AVG(quality_score) as avg_quality_score,
  MAX(quality_score) as max_quality_score,
  SUM(view_count) as total_views,
  SUM(like_count) as total_likes,
  SUM(comment_count) as total_comments,
  MAX(published_at) as latest_video_date,
  MAX(fetched_at) as last_fetch_date
FROM youtube_shorts;

-- Audit table for tracking changes
CREATE TABLE IF NOT EXISTS youtube_shorts_audit (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  youtube_video_id TEXT NOT NULL,
  action TEXT NOT NULL,
  changed_by TEXT,
  change_details JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_youtube_shorts_audit_video_id ON youtube_shorts_audit(youtube_video_id);
CREATE INDEX idx_youtube_shorts_audit_created_at ON youtube_shorts_audit(created_at DESC);

-- Function to log changes
CREATE OR REPLACE FUNCTION audit_youtube_shorts()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO youtube_shorts_audit (youtube_video_id, action, change_details, created_at)
  VALUES (
    COALESCE(NEW.youtube_video_id, OLD.youtube_video_id),
    TG_OP,
    jsonb_build_object(
      'old_data', to_jsonb(OLD),
      'new_data', to_jsonb(NEW)
    ),
    CURRENT_TIMESTAMP
  );
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER youtube_shorts_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON youtube_shorts
FOR EACH ROW
EXECUTE FUNCTION audit_youtube_shorts();

-- User Preferences Table for personalized YouTube feed
CREATE TABLE IF NOT EXISTS youtube_user_preferences (
  user_id TEXT PRIMARY KEY,
  preferred_languages TEXT[] DEFAULT ARRAY['en', 'fr'],
  min_quality_score DECIMAL(3, 1) DEFAULT 6.0,
  excluded_channels TEXT[] DEFAULT ARRAY[]::TEXT[],
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Enable RLS for preferences
ALTER TABLE youtube_user_preferences ENABLE ROW LEVEL SECURITY;

-- Users can only see their own preferences
CREATE POLICY "Allow users to read own preferences" ON youtube_user_preferences
  FOR SELECT
  USING (user_id = auth.uid()::text);

-- Users can update their own preferences
CREATE POLICY "Allow users to update own preferences" ON youtube_user_preferences
  FOR UPDATE
  USING (user_id = auth.uid()::text)
  WITH CHECK (user_id = auth.uid()::text);

-- Users can insert their own preferences
CREATE POLICY "Allow users to insert own preferences" ON youtube_user_preferences
  FOR INSERT
  WITH CHECK (user_id = auth.uid()::text);

-- Index for faster lookups
CREATE INDEX idx_youtube_user_preferences_user_id ON youtube_user_preferences(user_id);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_youtube_preferences_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER youtube_preferences_timestamp_trigger
BEFORE UPDATE ON youtube_user_preferences
FOR EACH ROW
EXECUTE FUNCTION update_youtube_preferences_timestamp();
