-- Initial database schema for HackerNews Summarizer

-- Stories table
-- Stores metadata about HackerNews stories
CREATE TABLE stories (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  url TEXT,
  by TEXT NOT NULL,
  time INTEGER NOT NULL,
  score INTEGER NOT NULL,
  status TEXT NOT NULL,
  content_id TEXT,
  summary_id TEXT,
  processed_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  error TEXT,
  retry_count INTEGER DEFAULT 0
);

-- Create index on status for efficient queries
CREATE INDEX idx_stories_status ON stories(status);

-- Create index on processed_at for time-based queries
CREATE INDEX idx_stories_processed_at ON stories(processed_at);

-- Create combined index on story status and processed_at 
-- for efficient queries to get latest stories by status
CREATE INDEX idx_stories_status_processed ON stories(status, processed_at DESC);

-- Create index on status and retry count for efficient retry queries
CREATE INDEX idx_stories_status_retry ON stories(status, retry_count);

-- Notifications table
-- Tracks when and where summaries have been sent
CREATE TABLE notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  story_id INTEGER NOT NULL,
  channel TEXT NOT NULL,
  status TEXT NOT NULL,
  sent_at TEXT,
  error TEXT,
  FOREIGN KEY (story_id) REFERENCES stories(id)
);

-- Create combined index on story_id and channel
CREATE UNIQUE INDEX idx_notifications_story_channel ON notifications(story_id, channel);

-- Create a more detailed notifications table
-- This will allow tracking multiple notification attempts per story
CREATE TABLE notification_details (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  story_id INTEGER NOT NULL,
  channel TEXT NOT NULL,         -- 'telegram', 'discord', etc.
  status TEXT NOT NULL,          -- 'pending', 'sent', 'failed'
  attempt_count INTEGER DEFAULT 1,
  first_attempt_at TEXT,
  last_attempt_at TEXT,
  sent_at TEXT,                  -- When the notification was successfully sent
  error TEXT,                    -- Error message if failed
  FOREIGN KEY (story_id) REFERENCES stories(id)
);

-- Create index on story_id for efficient lookups
CREATE INDEX idx_notification_details_story_id ON notification_details(story_id);

-- Add triggers to automatically set timestamps
CREATE TRIGGER set_notification_first_attempt_time
AFTER INSERT ON notification_details
BEGIN
  UPDATE notification_details
  SET first_attempt_at = CURRENT_TIMESTAMP,
      last_attempt_at = CURRENT_TIMESTAMP
  WHERE id = NEW.id AND first_attempt_at IS NULL;
END;

CREATE TRIGGER set_notification_last_attempt_time
AFTER UPDATE OF attempt_count ON notification_details
BEGIN
  UPDATE notification_details
  SET last_attempt_at = CURRENT_TIMESTAMP
  WHERE id = NEW.id;
END;

-- Settings table
-- Stores application settings
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Insert default settings
INSERT INTO settings (key, value, updated_at) 
VALUES 
  ('last_fetch_time', '0', CURRENT_TIMESTAMP),
  ('min_score_threshold', '100', CURRENT_TIMESTAMP),
  ('max_stories_per_day', '30', CURRENT_TIMESTAMP);

-- Stats table
-- Tracks usage statistics
CREATE TABLE stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  stories_fetched INTEGER DEFAULT 0,
  stories_processed INTEGER DEFAULT 0,
  stories_summarized INTEGER DEFAULT 0,
  notifications_sent INTEGER DEFAULT 0,
  api_tokens_used INTEGER DEFAULT 0,
  api_cost REAL DEFAULT 0.0,
  errors INTEGER DEFAULT 0
);

-- Create unique index on date
CREATE UNIQUE INDEX idx_stats_date ON stats(date);
