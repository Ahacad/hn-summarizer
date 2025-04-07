-- Add daily digest worker to worker_run_times table if it doesn't exist yet
INSERT OR IGNORE INTO worker_run_times (worker_name, last_run_time, updated_at) 
VALUES ('dailyDigest', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
