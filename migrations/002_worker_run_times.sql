-- Add worker run times table to track when each worker was last executed
CREATE TABLE worker_run_times (
  worker_name TEXT PRIMARY KEY,  -- Name of the worker (e.g., "storyFetcher")
  last_run_time TEXT NOT NULL,   -- ISO timestamp of the last run
  updated_at TEXT NOT NULL       -- When this record was last updated
);

-- Add an index for faster lookups
CREATE INDEX idx_worker_run_times_name ON worker_run_times(worker_name);
