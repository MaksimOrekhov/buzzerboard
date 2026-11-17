-- Share provider-wide backoff across Worker isolates and scheduled invocations.
CREATE TABLE nba_provider_cooldowns (
  provider TEXT PRIMARY KEY CHECK (provider IN ('dunkapi', 'espn', 'bbs')),
  retry_at_ms INTEGER NOT NULL DEFAULT 0,
  error_code TEXT NOT NULL,
  updated_at_ms INTEGER NOT NULL,
  remaining INTEGER,
  reset_at_ms INTEGER
);
