CREATE TABLE IF NOT EXISTS nba_cache (
  cache_key TEXT PRIMARY KEY,
  capability TEXT NOT NULL CHECK (capability IN ('games', 'standings', 'schedule')),
  provider TEXT NOT NULL CHECK (provider IN ('dunkapi', 'espn')),
  record_json TEXT NOT NULL,
  expires_at_ms INTEGER NOT NULL,
  stale_until_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS nba_cache_expiry_idx ON nba_cache (stale_until_ms);

CREATE TABLE IF NOT EXISTS nba_credit_usage (
  month TEXT PRIMARY KEY,
  baseline_credits INTEGER NOT NULL CHECK (baseline_credits >= 0),
  app_credits INTEGER NOT NULL CHECK (app_credits >= 0)
);

CREATE TABLE IF NOT EXISTS nba_rate_limits (
  rate_key TEXT NOT NULL,
  window_start_ms INTEGER NOT NULL,
  request_count INTEGER NOT NULL CHECK (request_count >= 0),
  expires_at_ms INTEGER NOT NULL,
  PRIMARY KEY (rate_key, window_start_ms)
);

CREATE INDEX IF NOT EXISTS nba_rate_limits_expiry_idx ON nba_rate_limits (expires_at_ms);

CREATE TABLE IF NOT EXISTS nba_refresh_locks (
  lock_key TEXT PRIMARY KEY,
  token TEXT NOT NULL,
  lease_expires_at_ms INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS nba_refresh_locks_expiry_idx ON nba_refresh_locks (lease_expires_at_ms);
