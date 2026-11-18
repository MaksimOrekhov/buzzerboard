-- Durable cursor for the opt-in BBS daily refresh. Existing cache rows are untouched.
CREATE TABLE nba_scheduled_refresh (
  job_id TEXT PRIMARY KEY,
  progress_json TEXT NOT NULL,
  updated_at_ms INTEGER NOT NULL
);
