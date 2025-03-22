-- Add worker run times table to track when each worker was last executed
CREATE TABLE worker_run_times (
  worker_name TEXT PRIMARY KEY,  -- Name of the worker (e.g., "storyFetcher")
  last_run_time TEXT NOT NULL,   -- ISO timestamp of the last run
  updated_at TEXT NOT NULL       -- When this record was last updated
);

-- Add an index for faster lookups
CREATE INDEX idx_worker_run_times_name ON worker_run_times(worker_name);

-- Insert initial worker records with current timestamp
-- This will ensure all workers run on their next scheduled interval
INSERT INTO worker_run_times (worker_name, last_run_time, updated_at) VALUES
  ('storyFetcher', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('contentProcessor', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('summaryGenerator', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('notificationSender', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
